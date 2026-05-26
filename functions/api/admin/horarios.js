// api/admin/horarios.js - CRUD for schedules (with section support)
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

function checkAdmin(user) {
  return user && user.rol === 'admin';
}

// GET - List schedules with materia, profesor and section info
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;
  const profesor_id = url.searchParams.get('profesor_id') || null;
  const seccion_id = url.searchParams.get('seccion_id') || null;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM schedules WHERE activo = 1';
    let listQuery = `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido, u.cedula as profesor_cedula,
              sec.nombre as seccion_nombre, sec.grado as seccion_grado, sec.turno as seccion_turno,
              (SELECT COUNT(*) FROM schedule_students ss WHERE ss.horario_id = s.id) as total_estudiantes
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
       LEFT JOIN sections sec ON s.seccion_id = sec.id
       WHERE s.activo = 1`;
    const params = [];

    if (profesor_id) {
      countQuery += ' AND s.profesor_id = ?';
      listQuery += ' AND s.profesor_id = ?';
      params.push(profesor_id);
    }
    if (seccion_id) {
      countQuery += ' AND s.seccion_id = ?';
      listQuery += ' AND s.seccion_id = ?';
      params.push(seccion_id);
    }

    listQuery += ' ORDER BY s.dia_semana, s.hora_inicio LIMIT ? OFFSET ?';

    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(listQuery)
      .bind(...params, limit, offset)
      .all();

    // Add section display string
    results.forEach(s => {
      if (s.seccion_grado && s.seccion_nombre) {
        s.seccion_display = `${s.seccion_grado}° "${s.seccion_nombre}"`;
      } else {
        s.seccion_display = '-';
      }
    });

    return jsonResponse({
      schedules: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List schedules error:', error);
    return jsonResponse({ error: 'Error al listar horarios' }, 500);
  }
}

// POST - Create schedule (with section and auto-assign students)
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { materia_id, profesor_id, seccion_id, dia_semana, hora_inicio, hora_fin, aula, periodo_escolar } = body;

    if (!materia_id || !profesor_id || !dia_semana || !hora_inicio || !hora_fin) {
      return jsonResponse({ error: 'Materia, profesor, día de la semana, hora de inicio y hora de fin son requeridos' }, 400);
    }

    // Validate profesor has rol 'profesor'
    const profesor = await env.DB.prepare('SELECT id, rol FROM users WHERE id = ? AND activo = 1')
      .bind(profesor_id)
      .first();

    if (!profesor || profesor.rol !== 'profesor') {
      return jsonResponse({ error: 'El profesor seleccionado no es válido' }, 400);
    }

    // Validate materia exists
    const materia = await env.DB.prepare('SELECT id FROM subjects WHERE id = ? AND activo = 1')
      .bind(materia_id)
      .first();

    if (!materia) {
      return jsonResponse({ error: 'La materia seleccionada no es válida' }, 400);
    }

    // Check for schedule conflicts
    const conflict = await env.DB.prepare(
      `SELECT id FROM schedules WHERE profesor_id = ? AND dia_semana = ? AND activo = 1
       AND ((hora_inicio < ? AND hora_fin > ?) OR (hora_inicio < ? AND hora_fin > ?) OR (hora_inicio >= ? AND hora_fin <= ?))`
    )
      .bind(profesor_id, dia_semana, hora_fin, hora_fin, hora_inicio, hora_inicio, hora_inicio, hora_fin)
      .first();

    if (conflict) {
      return jsonResponse({ error: 'El profesor ya tiene un horario asignado en ese rango de horas' }, 400);
    }

    // Get periodo_escolar from school_config if not provided
    let periodo = periodo_escolar;
    if (!periodo) {
      const config = await env.DB.prepare('SELECT periodo_escolar_actual FROM school_config ORDER BY id ASC LIMIT 1').first();
      periodo = config?.periodo_escolar_actual || '2024-2025';
    }

    const result = await env.DB.prepare(
      `INSERT INTO schedules (materia_id, profesor_id, seccion_id, dia_semana, hora_inicio, hora_fin, aula, periodo_escolar, activo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"))`
    )
      .bind(materia_id, profesor_id, seccion_id || null, dia_semana, hora_inicio, hora_fin, aula || null, periodo)
      .run();

    const newScheduleId = result.meta.last_row_id;

    // Auto-assign students from the section to this schedule
    let autoAssigned = 0;
    if (seccion_id) {
      const section = await env.DB.prepare('SELECT grado, nombre FROM sections WHERE id = ?').bind(seccion_id).first();
      if (section) {
        // Find all students in this grade/section
        const { results: studentsInSec } = await env.DB.prepare(
          'SELECT id FROM students WHERE grado = ? AND seccion = ? AND activo = 1'
        ).bind(section.grado, section.nombre).all();

        for (const st of studentsInSec) {
          // Check not already assigned
          const exists = await env.DB.prepare(
            'SELECT id FROM schedule_students WHERE horario_id = ? AND estudiante_id = ?'
          ).bind(newScheduleId, st.id).first();

          if (!exists) {
            await env.DB.prepare(
              'INSERT INTO schedule_students (horario_id, estudiante_id, fecha_asignacion) VALUES (?, ?, datetime("now"))'
            ).bind(newScheduleId, st.id).run();
            autoAssigned++;
          }
        }
      }
    }

    const newSchedule = await env.DB.prepare(
      `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido,
              sec.nombre as seccion_nombre, sec.grado as seccion_grado
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
       LEFT JOIN sections sec ON s.seccion_id = sec.id
       WHERE s.id = ?`
    )
      .bind(newScheduleId)
      .first();

    return jsonResponse({ 
      schedule: newSchedule, 
      message: `Horario creado exitosamente. ${autoAssigned} estudiante(s) asignado(s) automáticamente.`,
      autoAssigned
    }, 201);
  } catch (error) {
    console.error('Create schedule error:', error);
    return jsonResponse({ error: 'Error al crear horario' }, 500);
  }
}

// PUT - Update schedule
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, materia_id, profesor_id, seccion_id, dia_semana, hora_inicio, hora_fin, aula, periodo_escolar } = body;

    if (!id) {
      return jsonResponse({ error: 'ID de horario es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Horario no encontrado' }, 404);
    }

    await env.DB.prepare(
      `UPDATE schedules SET materia_id = ?, profesor_id = ?, seccion_id = ?, dia_semana = ?, hora_inicio = ?, hora_fin = ?, aula = ?, periodo_escolar = ? WHERE id = ?`
    )
      .bind(
        materia_id || existing.materia_id,
        profesor_id || existing.profesor_id,
        seccion_id !== undefined ? seccion_id : existing.seccion_id,
        dia_semana !== undefined ? dia_semana : existing.dia_semana,
        hora_inicio || existing.hora_inicio,
        hora_fin || existing.hora_fin,
        aula !== undefined ? aula : existing.aula,
        periodo_escolar || existing.periodo_escolar,
        id
      )
      .run();

    const updatedSchedule = await env.DB.prepare(
      `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido,
              sec.nombre as seccion_nombre, sec.grado as seccion_grado
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
       LEFT JOIN sections sec ON s.seccion_id = sec.id
       WHERE s.id = ?`
    )
      .bind(id)
      .first();

    return jsonResponse({ schedule: updatedSchedule, message: 'Horario actualizado exitosamente' });
  } catch (error) {
    console.error('Update schedule error:', error);
    return jsonResponse({ error: 'Error al actualizar horario' }, 500);
  }
}

// DELETE - Deactivate schedule
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID de horario es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM schedules WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Horario no encontrado' }, 404);
    }

    await env.DB.prepare('UPDATE schedules SET activo = 0 WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ message: 'Horario desactivado exitosamente' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    return jsonResponse({ error: 'Error al desactivar horario' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET':
      return handleGet(request, env, user);
    case 'POST':
      return handlePost(request, env, user);
    case 'PUT':
      return handlePut(request, env, user);
    case 'DELETE':
      return handleDelete(request, env, user);
    default:
      return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
