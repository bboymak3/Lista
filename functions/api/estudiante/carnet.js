// api/estudiante/carnet.js - Student carnet data and attendance history
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

function checkAccess(user) {
  return user && (user.rol === 'admin' || user.rol === 'profesor' || user.rol === 'representante' || user.rol === 'estudiante');
}

// GET - Get student's carnet data (personal info + QR code) or attendance history
async function handleGet(request, env, user) {
  if (!checkAccess(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'carnet';
  const estudiante_id = url.searchParams.get('estudiante_id');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    let targetStudentId = estudiante_id;

    // If user is a student, they can only see their own data
    if (user.rol === 'estudiante') {
      // Look up student by user's cedula matching cedula_escolar
      const student = await env.DB.prepare('SELECT id FROM students WHERE cedula_escolar = ?')
        .bind(user.cedula)
        .first();
      if (student) {
        targetStudentId = student.id;
      } else {
        return jsonResponse({ error: 'Estudiante no encontrado para este usuario' }, 404);
      }
    }

    // If user is representante, verify the student belongs to them
    if (user.rol === 'representante' && targetStudentId) {
      const relation = await env.DB.prepare(
        'SELECT id FROM parent_student WHERE representante_id = ? AND estudiante_id = ?'
      )
        .bind(user.id, targetStudentId)
        .first();

      if (!relation) {
        return jsonResponse({ error: 'No tiene acceso a este estudiante' }, 403);
      }
    }

    if (!targetStudentId) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    if (action === 'carnet') {
      // Get student carnet data
      const student = await env.DB.prepare(
        `SELECT id, cedula_escolar, nombre, apellido, fecha_nacimiento, grado, seccion, turno,
                direccion, telefono_emergencia, codigo_unico, qr_code, foto_key
         FROM students WHERE id = ? AND activo = 1`
      )
        .bind(targetStudentId)
        .first();

      if (!student) {
        return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
      }

      return jsonResponse({ carnet: student });

    } else if (action === 'historial') {
      // Get student attendance history
      const countResult = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM attendance_records ar
         WHERE ar.estudiante_id = ?`
      )
        .bind(targetStudentId)
        .first();

      const total = countResult.total;

      const { results } = await env.DB.prepare(
        `SELECT ar.*, ats.fecha_inicio, ats.fecha_fin, ats.estado as sesion_estado,
                s.dia_semana, s.hora_inicio, s.hora_fin, s.aula,
                sub.nombre as materia_nombre, sub.codigo as materia_codigo
         FROM attendance_records ar
         INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
         INNER JOIN schedules s ON ats.horario_id = s.id
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         WHERE ar.estudiante_id = ?
         ORDER BY ar.fecha_registro DESC
         LIMIT ? OFFSET ?`
      )
        .bind(targetStudentId, limit, offset)
        .all();

      return jsonResponse({
        historial: results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: carnet, historial' }, 400);
    }
  } catch (error) {
    console.error('Get carnet error:', error);
    return jsonResponse({ error: 'Error al obtener datos del carnet' }, 500);
  }
}

// POST - Scan professor QR to mark attendance
async function handlePost(request, env, user) {
  if (!user || user.rol !== 'estudiante') {
    return jsonResponse({ error: 'Solo estudiantes pueden escanear asistencia' }, 403);
  }

  try {
    const body = await request.json();
    const { action, qr_data } = body;

    // Scan professor QR to mark own attendance
    if (action === 'escanear_asistencia' || qr_data) {
      // Parse the QR data from the professor
      let sesionId = null;
      try {
        const parsed = JSON.parse(qr_data);
        sesionId = parsed.sesion_id || parsed.session_id;
      } catch(e) {
        // Try as plain session ID
        sesionId = parseInt(qr_data);
      }

      if (!sesionId) {
        return jsonResponse({ error: 'Código QR inválido. No se pudo identificar la sesión.' }, 400);
      }

      // Verify session exists and is active
      const session = await env.DB.prepare(
        'SELECT id, estado, horario_id FROM attendance_sessions WHERE id = ? AND estado IN (?, ?)'
      ).bind(sesionId, 'en_curso', 'activa').first();

      if (!session) {
        return jsonResponse({ error: 'Sesión de clase no encontrada o ya finalizada' }, 404);
      }

      // Find the student
      const student = await env.DB.prepare(
        'SELECT id, codigo_unico, qr_code FROM students WHERE cedula_escolar = ? AND activo = 1'
      ).bind(user.cedula).first();

      if (!student) {
        return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
      }

      // Verify student is assigned to this schedule
      const assigned = await env.DB.prepare(
        'SELECT id FROM schedule_students WHERE horario_id = ? AND estudiante_id = ?'
      ).bind(session.horario_id, student.id).first();

      if (!assigned) {
        return jsonResponse({ error: 'No estás asignado a esta clase' }, 403);
      }

      // Upsert attendance record
      await env.DB.prepare(
        `INSERT INTO attendance_records (sesion_id, estudiante_id, estado, hora_registro, registrado_por)
         VALUES (?, ?, 'presente', datetime('now'), ?)
         ON CONFLICT(sesion_id, estudiante_id) DO UPDATE SET estado = 'presente', hora_registro = datetime('now')`
      ).bind(sesionId, student.id, user.id).run();

      return jsonResponse({ success: true, message: 'Asistencia registrada exitosamente', estado: 'presente' });
    }

    return jsonResponse({ error: 'Acción no válida' }, 400);
  } catch (error) {
    console.error('Scan attendance error:', error);
    return jsonResponse({ error: 'Error al registrar asistencia por QR' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (request.method === 'GET') {
    return handleGet(request, env, user);
  } else if (request.method === 'POST') {
    return handlePost(request, env, user);
  }

  return jsonResponse({ error: 'Método no permitido' }, 405);
}
