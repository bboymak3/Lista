// api/admin/asignaciones.js - Schedule-student assignments
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

// GET - List schedule_students assignments
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const horario_id = url.searchParams.get('horario_id') || null;
  const estudiante_id = url.searchParams.get('estudiante_id') || null;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM schedule_students ss WHERE 1=1';
    let listQuery = `SELECT ss.*,
       s.nombre as estudiante_nombre, s.apellido as estudiante_apellido, s.codigo_unico, s.grado, s.seccion,
       sch.dia_semana, sch.hora_inicio, sch.hora_fin, sch.aula,
       sub.nombre as materia_nombre,
       u.nombre as profesor_nombre, u.apellido as profesor_apellido
       FROM schedule_students ss
       LEFT JOIN students s ON ss.estudiante_id = s.id
       LEFT JOIN schedules sch ON ss.horario_id = sch.id
       LEFT JOIN subjects sub ON sch.materia_id = sub.id
       LEFT JOIN users u ON sch.profesor_id = u.id
       WHERE 1=1`;
    const params = [];

    if (horario_id) {
      countQuery += ' AND ss.horario_id = ?';
      listQuery += ' AND ss.horario_id = ?';
      params.push(horario_id);
    }
    if (estudiante_id) {
      countQuery += ' AND ss.estudiante_id = ?';
      listQuery += ' AND ss.estudiante_id = ?';
      params.push(estudiante_id);
    }

    listQuery += ' ORDER BY ss.fecha_asignacion DESC LIMIT ? OFFSET ?';

    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(listQuery)
      .bind(...params, limit, offset)
      .all();

    return jsonResponse({
      asignaciones: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List assignments error:', error);
    return jsonResponse({ error: 'Error al listar asignaciones' }, 500);
  }
}

// POST - Assign student(s) to schedule
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { horario_id, estudiante_ids } = body;

    if (!horario_id) {
      return jsonResponse({ error: 'ID de horario es requerido' }, 400);
    }

    // Validate schedule exists
    const schedule = await env.DB.prepare('SELECT id FROM schedules WHERE id = ? AND activo = 1')
      .bind(horario_id)
      .first();

    if (!schedule) {
      return jsonResponse({ error: 'Horario no encontrado' }, 404);
    }

    // Support single or multiple student IDs
    const studentIdList = Array.isArray(estudiante_ids) ? estudiante_ids : [estudiante_ids];
    if (studentIdList.length === 0) {
      return jsonResponse({ error: 'Se requiere al menos un estudiante' }, 400);
    }

    const assigned = [];
    const errors = [];

    for (const estId of studentIdList) {
      // Validate student exists
      const student = await env.DB.prepare('SELECT id, nombre, apellido FROM students WHERE id = ? AND activo = 1')
        .bind(estId)
        .first();

      if (!student) {
        errors.push({ estudiante_id: estId, error: 'Estudiante no encontrado' });
        continue;
      }

      // Check if already assigned
      const existing = await env.DB.prepare(
        'SELECT id FROM schedule_students WHERE horario_id = ? AND estudiante_id = ?'
      )
        .bind(horario_id, estId)
        .first();

      if (existing) {
        errors.push({ estudiante_id: estId, error: 'Estudiante ya asignado a este horario' });
        continue;
      }

      await env.DB.prepare(
        'INSERT INTO schedule_students (horario_id, estudiante_id, fecha_asignacion) VALUES (?, ?, datetime("now"))'
      )
        .bind(horario_id, estId)
        .run();

      assigned.push({ estudiante_id: estId, nombre: student.nombre, apellido: student.apellido });
    }

    return jsonResponse({
      message: `${assigned.length} estudiante(s) asignado(s) exitosamente`,
      assigned,
      errors: errors.length > 0 ? errors : undefined,
    }, assigned.length > 0 ? 201 : 400);
  } catch (error) {
    console.error('Create assignment error:', error);
    return jsonResponse({ error: 'Error al crear asignación' }, 500);
  }
}

// DELETE - Remove student from schedule
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const horario_id = url.searchParams.get('horario_id');
    const estudiante_id = url.searchParams.get('estudiante_id');
    const id = url.searchParams.get('id');

    if (!horario_id && !estudiante_id && !id) {
      return jsonResponse({ error: 'Se requiere id de asignación, o bien horario_id y estudiante_id' }, 400);
    }

    let result;
    if (id) {
      result = await env.DB.prepare('DELETE FROM schedule_students WHERE id = ?')
        .bind(id)
        .run();
    } else {
      result = await env.DB.prepare('DELETE FROM schedule_students WHERE horario_id = ? AND estudiante_id = ?')
        .bind(horario_id, estudiante_id)
        .run();
    }

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Asignación no encontrada' }, 404);
    }

    return jsonResponse({ message: 'Estudiante removido del horario exitosamente' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return jsonResponse({ error: 'Error al remover asignación' }, 500);
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
    case 'DELETE':
      return handleDelete(request, env, user);
    default:
      return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
