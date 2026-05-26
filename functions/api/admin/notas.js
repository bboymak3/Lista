// api/admin/notas.js - Grade management (admin)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function checkAdmin(user) {
  return user && user.rol === 'admin';
}

// GET - List grades with filters
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const estudiante_id = url.searchParams.get('estudiante_id') || null;
    const materia_id = url.searchParams.get('materia_id') || null;
    const lapso_id = url.searchParams.get('lapso_id') || null;
    const evaluacion_id = url.searchParams.get('evaluacion_id') || null;

    let query = `SELECT g.*, e.titulo as evaluacion_titulo, e.tipo as evaluacion_tipo,
                 e.ponderacion, e.materia_id, e.lapso_id,
                 s.nombre as estudiante_nombre, s.apellido as estudiante_apellido,
                 s.codigo_unico, sub.nombre as materia_nombre, l.nombre as lapso_nombre,
                 u.nombre as registrador_nombre, u.apellido as registrador_apellido
                 FROM grades g
                 INNER JOIN evaluations e ON g.evaluacion_id = e.id
                 INNER JOIN students s ON g.estudiante_id = s.id
                 INNER JOIN subjects sub ON e.materia_id = sub.id
                 INNER JOIN lapsos l ON e.lapso_id = l.id
                 INNER JOIN users u ON g.registrado_por = u.id
                 WHERE 1=1`;
    const params = [];

    if (estudiante_id) {
      query += ' AND g.estudiante_id = ?';
      params.push(estudiante_id);
    }
    if (materia_id) {
      query += ' AND e.materia_id = ?';
      params.push(materia_id);
    }
    if (lapso_id) {
      query += ' AND e.lapso_id = ?';
      params.push(lapso_id);
    }
    if (evaluacion_id) {
      query += ' AND g.evaluacion_id = ?';
      params.push(evaluacion_id);
    }

    query += ' ORDER BY l.numero, sub.nombre, e.titulo, s.apellido, s.nombre';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return json({ notas: results });
  } catch (error) {
    console.error('List grades error:', error);
    return json({ error: 'Error al listar notas' }, 500);
  }
}

// PUT - Update a grade
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, nota, observaciones } = body;

    if (!id) {
      return json({ error: 'ID de nota es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM grades WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'Nota no encontrada' }, 404);
    }

    await env.DB.prepare(
      `UPDATE grades SET nota = ?, observaciones = ?, fecha_actualizacion = datetime("now") WHERE id = ?`
    )
      .bind(
        nota !== undefined ? nota : existing.nota,
        observaciones !== undefined ? observaciones : existing.observaciones,
        id
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM grades WHERE id = ?').bind(id).first();
    return json({ nota: updated, message: 'Nota actualizada exitosamente' });
  } catch (error) {
    console.error('Update grade error:', error);
    return json({ error: 'Error al actualizar nota' }, 500);
  }
}

// DELETE - Delete a grade
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return json({ error: 'ID de nota es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM grades WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'Nota no encontrada' }, 404);
    }

    await env.DB.prepare('DELETE FROM grades WHERE id = ?').bind(id).run();

    return json({ message: 'Nota eliminada exitosamente' });
  } catch (error) {
    console.error('Delete grade error:', error);
    return json({ error: 'Error al eliminar nota' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET':
      return handleGet(request, env, user);
    case 'PUT':
      return handlePut(request, env, user);
    case 'DELETE':
      return handleDelete(request, env, user);
    default:
      return json({ error: 'Método no permitido' }, 405);
  }
}
