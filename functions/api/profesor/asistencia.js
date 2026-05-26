// api/profesor/asistencia.js - Attendance session management
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function checkProfesor(user) {
  return user && (user.rol === 'profesor' || user.rol === 'admin');
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST - Start attendance session
async function handleStartSession(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { horario_id, latitud, longitud } = body;

    if (!horario_id) {
      return jsonResponse({ error: 'ID de horario es requerido' }, 400);
    }

    // Validate geolocation - OPTIONAL: only validate if coordinates provided AND school_config exists
    if (latitud !== undefined && longitud !== undefined && latitud !== null && longitud !== null) {
      try {
        const schoolConfig = await env.DB.prepare(
          'SELECT latitud, longitud, radio_permitido FROM school_config ORDER BY id ASC LIMIT 1'
        ).first();

        if (schoolConfig && schoolConfig.latitud && schoolConfig.longitud) {
          const distance = haversineDistance(latitud, longitud, schoolConfig.latitud, schoolConfig.longitud);
          if (distance > schoolConfig.radio_permitido) {
            return jsonResponse({
              error: `Fuera del rango permitido. Distancia: ${Math.round(distance)}m, permitido: ${schoolConfig.radio_permitido}m`,
              distancia: Math.round(distance),
              radio_permitido: schoolConfig.radio_permitido,
            }, 403);
          }
        }
      } catch (geoError) {
        console.error('Geolocation validation error (non-blocking):', geoError);
        // Continue without geolocation validation if there's an error
      }
    }

    // Validate schedule belongs to this professor
    const schedule = await env.DB.prepare(
      'SELECT * FROM schedules WHERE id = ? AND profesor_id = ? AND activo = 1'
    )
      .bind(horario_id, user.id)
      .first();

    if (!schedule) {
      return jsonResponse({ error: 'Horario no encontrado o no pertenece a este profesor' }, 404);
    }

    // Check if there's already an active session for this schedule today
    const today = new Date().toISOString().split('T')[0];
    const existingSession = await env.DB.prepare(
      `SELECT id FROM attendance_sessions WHERE horario_id = ? AND estado = 'activa' AND DATE(fecha_inicio) = ?`
    )
      .bind(horario_id, today)
      .first();

    if (existingSession) {
      // Return the existing session instead of erroring
      const session = await env.DB.prepare('SELECT * FROM attendance_sessions WHERE id = ?')
        .bind(existingSession.id)
        .first();
      return jsonResponse({ sesion: session, message: 'Sesión de asistencia ya estaba activa' });
    }

    const result = await env.DB.prepare(
      `INSERT INTO attendance_sessions (horario_id, estado, fecha_inicio) VALUES (?, 'activa', datetime("now"))`
    )
      .bind(horario_id)
      .run();

    const session = await env.DB.prepare('SELECT * FROM attendance_sessions WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return jsonResponse({ sesion: session, message: 'Sesión de asistencia iniciada' }, 201);
  } catch (error) {
    console.error('Start session error:', error);
    return jsonResponse({ error: 'Error al iniciar sesión de asistencia' }, 500);
  }
}

// GET - Get students for a session
async function handleGetStudents(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const sesion_id = url.searchParams.get('sesion_id');

    if (!sesion_id) {
      return jsonResponse({ error: 'ID de sesión es requerido' }, 400);
    }

    // Validate session
    const session = await env.DB.prepare(
      `SELECT ats.*, s.profesor_id, s.materia_id, sub.nombre as materia_nombre
       FROM attendance_sessions ats
       INNER JOIN schedules s ON ats.horario_id = s.id
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       WHERE ats.id = ?`
    )
      .bind(sesion_id)
      .first();

    if (!session) {
      return jsonResponse({ error: 'Sesión no encontrada' }, 404);
    }

    if (session.profesor_id !== user.id && user.rol !== 'admin') {
      return jsonResponse({ error: 'No tiene acceso a esta sesión' }, 403);
    }

    // Get students assigned to this schedule
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion, s.foto,
              COALESCE(ar.estado, 'sin_registro') as estado_asistencia,
              ar.id as registro_id
       FROM schedule_students ss
       INNER JOIN students s ON ss.estudiante_id = s.id
       LEFT JOIN attendance_records ar ON ar.estudiante_id = s.id AND ar.sesion_id = ?
       WHERE ss.horario_id = ? AND s.activo = 1
       ORDER BY s.apellido, s.nombre`
    )
      .bind(sesion_id, session.horario_id)
      .all();

    return jsonResponse({ estudiantes: results, sesion: session });
  } catch (error) {
    console.error('Get students for session error:', error);
    return jsonResponse({ error: 'Error al obtener estudiantes' }, 500);
  }
}

// POST - Record attendance (batch)
async function handleRecordAttendance(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { sesion_id, registros } = body;

    if (!sesion_id || !registros || !Array.isArray(registros)) {
      return jsonResponse({ error: 'sesion_id y registros (array) son requeridos' }, 400);
    }

    // Validate session exists and is active
    const session = await env.DB.prepare(
      `SELECT ats.*, s.profesor_id, s.materia_id FROM attendance_sessions ats
       INNER JOIN schedules s ON ats.horario_id = s.id
       WHERE ats.id = ?`
    )
      .bind(sesion_id)
      .first();

    if (!session) {
      return jsonResponse({ error: 'Sesión no encontrada' }, 404);
    }

    if (session.profesor_id !== user.id && user.rol !== 'admin') {
      return jsonResponse({ error: 'No tiene acceso a esta sesión' }, 403);
    }

    // Allow recording even on closed sessions (for late corrections)
    // but warn if session is not active
    const sessionActive = session.estado === 'activa';

    const validStates = ['presente', 'ausente', 'tardanza', 'justificado'];
    const recorded = [];
    const errors = [];

    for (const reg of registros) {
      const { estudiante_id, estado, observacion } = reg;

      if (!estudiante_id || !estado) {
        errors.push({ estudiante_id, error: 'estudiante_id y estado son requeridos' });
        continue;
      }

      if (!validStates.includes(estado)) {
        errors.push({ estudiante_id, error: `Estado inválido: ${estado}` });
        continue;
      }

      // Check if student belongs to this schedule
      const assignment = await env.DB.prepare(
        'SELECT id FROM schedule_students WHERE horario_id = ? AND estudiante_id = ?'
      )
        .bind(session.horario_id, estudiante_id)
        .first();

      if (!assignment) {
        errors.push({ estudiante_id, error: 'Estudiante no asignado a este horario' });
        continue;
      }

      // Upsert attendance record
      const existingRecord = await env.DB.prepare(
        'SELECT id, estado FROM attendance_records WHERE sesion_id = ? AND estudiante_id = ?'
      )
        .bind(sesion_id, estudiante_id)
        .first();

      const previousState = existingRecord?.estado || null;

      if (existingRecord) {
        // Update existing record
        await env.DB.prepare(
          'UPDATE attendance_records SET estado = ?, observacion = ?, fecha_registro = datetime("now") WHERE id = ?'
        )
          .bind(estado, observacion || null, existingRecord.id)
          .run();
      } else {
        // Create new record
        await env.DB.prepare(
          `INSERT INTO attendance_records (sesion_id, estudiante_id, estado, observacion, fecha_registro)
           VALUES (?, ?, ?, ?, datetime("now"))`
        )
          .bind(sesion_id, estudiante_id, estado, observacion || null)
          .run();
      }

      // Create notification for ausente or tardanza
      // Only create notification if the state changed to ausente (not if already was ausente)
      if (estado === 'ausente' && previousState !== 'ausente') {
        try {
          // Find parents of this student
          const { results: parents } = await env.DB.prepare(
            `SELECT u.id, u.nombre, u.apellido FROM parent_student ps
             INNER JOIN users u ON ps.representante_id = u.id
             WHERE ps.estudiante_id = ? AND u.activo = 1`
          )
            .bind(estudiante_id)
            .all();

          // Get student name
          const student = await env.DB.prepare('SELECT nombre, apellido FROM students WHERE id = ?')
            .bind(estudiante_id)
            .first();

          const materia = await env.DB.prepare('SELECT nombre FROM subjects WHERE id = ?')
            .bind(session.materia_id)
            .first();

          const titulo = `Ausencia de ${student?.nombre || ''} ${student?.apellido || ''}`;
          const mensaje = `Se informa que el/la estudiante ${student?.nombre || ''} ${student?.apellido || ''} ha sido registrado/a como AUSENTE en la materia de ${materia?.nombre || 'N/A'} el día de hoy.`;

          for (const parent of parents) {
            await env.DB.prepare(
              `INSERT INTO notifications (representante_id, estudiante_id, sesion_id, tipo, titulo, mensaje, leida, fecha_creacion)
               VALUES (?, ?, ?, 'ausencia', ?, ?, 0, datetime("now"))`
            )
              .bind(parent.id, estudiante_id, sesion_id, titulo, mensaje)
              .run();
          }
        } catch (notifError) {
          console.error('Notification creation error:', notifError);
          // Don't fail the whole request for notification errors
        }
      } else if (estado === 'tardanza' && previousState !== 'tardanza') {
        try {
          const { results: parents } = await env.DB.prepare(
            `SELECT u.id, u.nombre, u.apellido FROM parent_student ps
             INNER JOIN users u ON ps.representante_id = u.id
             WHERE ps.estudiante_id = ? AND u.activo = 1`
          )
            .bind(estudiante_id)
            .all();

          const student = await env.DB.prepare('SELECT nombre, apellido FROM students WHERE id = ?')
            .bind(estudiante_id)
            .first();

          const materia = await env.DB.prepare('SELECT nombre FROM subjects WHERE id = ?')
            .bind(session.materia_id)
            .first();

          const titulo = `Tardanza de ${student?.nombre || ''} ${student?.apellido || ''}`;
          const mensaje = `Se informa que el/la estudiante ${student?.nombre || ''} ${student?.apellido || ''} ha sido registrado/a con TARDANZA en la materia de ${materia?.nombre || 'N/A'} el día de hoy.`;

          for (const parent of parents) {
            await env.DB.prepare(
              `INSERT INTO notifications (representante_id, estudiante_id, sesion_id, tipo, titulo, mensaje, leida, fecha_creacion)
               VALUES (?, ?, ?, 'tardanza', ?, ?, 0, datetime("now"))`
            )
              .bind(parent.id, estudiante_id, sesion_id, titulo, mensaje)
              .run();
          }
        } catch (notifError) {
          console.error('Notification creation error:', notifError);
        }
      }

      recorded.push({ estudiante_id, estado });
    }

    return jsonResponse({
      message: `${recorded.length} registro(s) de asistencia guardado(s)`,
      registrados: recorded,
      errores: errors.length > 0 ? errors : undefined,
      sesion_activa: sessionActive,
    });
  } catch (error) {
    console.error('Record attendance error:', error);
    return jsonResponse({ error: 'Error al registrar asistencia' }, 500);
  }
}

// PUT - End attendance session
async function handleEndSession(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { sesion_id } = body;

    if (!sesion_id) {
      return jsonResponse({ error: 'ID de sesión es requerido' }, 400);
    }

    // Validate session
    const session = await env.DB.prepare(
      `SELECT ats.*, s.profesor_id FROM attendance_sessions ats
       INNER JOIN schedules s ON ats.horario_id = s.id
       WHERE ats.id = ?`
    )
      .bind(sesion_id)
      .first();

    if (!session) {
      return jsonResponse({ error: 'Sesión no encontrada' }, 404);
    }

    if (session.profesor_id !== user.id && user.rol !== 'admin') {
      return jsonResponse({ error: 'No tiene acceso a esta sesión' }, 403);
    }

    if (session.estado !== 'activa') {
      return jsonResponse({ error: 'La sesión ya no está activa' }, 400);
    }

    // Auto-mark all unmarked students as "ausente" before closing
    const { results: unmarkedStudents } = await env.DB.prepare(
      `SELECT ss.estudiante_id FROM schedule_students ss
       LEFT JOIN attendance_records ar ON ar.estudiante_id = ss.estudiante_id AND ar.sesion_id = ?
       WHERE ss.horario_id = ? AND ar.id IS NULL`
    )
      .bind(sesion_id, session.horario_id)
      .all();

    // Mark unmarked students as ausente and send notifications
    for (const us of unmarkedStudents) {
      await env.DB.prepare(
        `INSERT INTO attendance_records (sesion_id, estudiante_id, estado, observacion, fecha_registro)
         VALUES (?, ?, 'ausente', 'No marcado por el profesor', datetime("now"))`
      )
        .bind(sesion_id, us.estudiante_id)
        .run();

      // Send notification to parents
      try {
        const { results: parents } = await env.DB.prepare(
          `SELECT u.id FROM parent_student ps
           INNER JOIN users u ON ps.representante_id = u.id
           WHERE ps.estudiante_id = ? AND u.activo = 1`
        )
          .bind(us.estudiante_id)
          .all();

        const student = await env.DB.prepare('SELECT nombre, apellido FROM students WHERE id = ?')
          .bind(us.estudiante_id)
          .first();

        const materia = await env.DB.prepare('SELECT nombre FROM subjects WHERE id = ?')
          .bind(session.materia_id)
          .first();

        const titulo = `Ausencia de ${student?.nombre || ''} ${student?.apellido || ''}`;
        const mensaje = `Se informa que el/la estudiante ${student?.nombre || ''} ${student?.apellido || ''} fue registrado/a como AUSENTE en la materia de ${materia?.nombre || 'N/A'} (clase finalizada).`;

        for (const parent of parents) {
          await env.DB.prepare(
            `INSERT INTO notifications (representante_id, estudiante_id, sesion_id, tipo, titulo, mensaje, leida, fecha_creacion)
             VALUES (?, ?, ?, 'ausencia', ?, ?, 0, datetime("now"))`
          )
            .bind(parent.id, us.estudiante_id, sesion_id, titulo, mensaje)
            .run();
        }
      } catch (notifError) {
        console.error('Notification error for unmarked student:', notifError);
      }
    }

    await env.DB.prepare(
      `UPDATE attendance_sessions SET estado = 'cerrada', fecha_fin = datetime("now") WHERE id = ?`
    )
      .bind(sesion_id)
      .run();

    const updatedSession = await env.DB.prepare('SELECT * FROM attendance_sessions WHERE id = ?')
      .bind(sesion_id)
      .first();

    return jsonResponse({
      sesion: updatedSession,
      message: 'Sesión de asistencia cerrada',
      auto_marked_ausente: unmarkedStudents.length,
    });
  } catch (error) {
    console.error('End session error:', error);
    return jsonResponse({ error: 'Error al cerrar sesión de asistencia' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  if (method === 'GET') {
    return handleGetStudents(request, env, user);
  }

  if (method === 'POST') {
    // Determine action based on body content
    try {
      // Clone the request to read the body
      const clonedRequest = request.clone();
      const body = await clonedRequest.json();

      if (body.action === 'iniciar') {
        return handleStartSession(request, env, user);
      } else if (body.action === 'registrar' || body.registros) {
        return handleRecordAttendance(request, env, user);
      } else if (body.horario_id && !body.registros) {
        // Default: start session if horario_id is provided without registros
        return handleStartSession(request, env, user);
      } else {
        return jsonResponse({ error: 'Acción no válida. Use action: "iniciar" o proporcione registros' }, 400);
      }
    } catch (e) {
      return jsonResponse({ error: 'Cuerpo de la petición inválido' }, 400);
    }
  }

  if (method === 'PUT') {
    return handleEndSession(request, env, user);
  }

  return jsonResponse({ error: 'Método no permitido' }, 405);
}
