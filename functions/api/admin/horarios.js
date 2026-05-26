// api/admin/horarios.js - CRUD for schedules
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

// GET - List schedules with materia and profesor info
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM schedules WHERE activo = 1'
    ).first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(
      `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido, u.cedula as profesor_cedula
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
       WHERE s.activo = 1
       ORDER BY s.dia_semana, s.hora_inicio
       LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all();

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

// POST - Create schedule
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { materia_id, profesor_id, dia_semana, hora_inicio, hora_fin, aula } = body;

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

    const result = await env.DB.prepare(
      `INSERT INTO schedules (materia_id, profesor_id, dia_semana, hora_inicio, hora_fin, aula, activo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime("now"))`
    )
      .bind(materia_id, profesor_id, dia_semana, hora_inicio, hora_fin, aula || null)
      .run();

    const newSchedule = await env.DB.prepare(
      `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
       WHERE s.id = ?`
    )
      .bind(result.meta.last_row_id)
      .first();

    return jsonResponse({ schedule: newSchedule, message: 'Horario creado exitosamente' }, 201);
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
    const { id, materia_id, profesor_id, dia_semana, hora_inicio, hora_fin, aula } = body;

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
      `UPDATE schedules SET materia_id = ?, profesor_id = ?, dia_semana = ?, hora_inicio = ?, hora_fin = ?, aula = ? WHERE id = ?`
    )
      .bind(
        materia_id || existing.materia_id,
        profesor_id || existing.profesor_id,
        dia_semana !== undefined ? dia_semana : existing.dia_semana,
        hora_inicio || existing.hora_inicio,
        hora_fin || existing.hora_fin,
        aula !== undefined ? aula : existing.aula,
        id
      )
      .run();

    const updatedSchedule = await env.DB.prepare(
      `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.nombre as profesor_nombre, u.apellido as profesor_apellido
       FROM schedules s
       LEFT JOIN subjects sub ON s.materia_id = sub.id
       LEFT JOIN users u ON s.profesor_id = u.id
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
