// api/admin/lapsos.js - Academic period (lapso) management
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

// GET - List lapsos with filters
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const periodo_escolar = url.searchParams.get('periodo_escolar') || null;
    const activo = url.searchParams.get('activo') || null;

    let query = 'SELECT * FROM lapsos WHERE 1=1';
    const params = [];

    if (periodo_escolar) {
      query += ' AND periodo_escolar = ?';
      params.push(periodo_escolar);
    }
    if (activo !== null && activo !== '') {
      query += ' AND activo = ?';
      params.push(parseInt(activo));
    }

    query += ' ORDER BY numero ASC, fecha_inicio ASC';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return json({ lapsos: results });
  } catch (error) {
    console.error('List lapsos error:', error);
    return json({ error: 'Error al listar lapsos' }, 500);
  }
}

// POST - Create lapso
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { numero, nombre, fecha_inicio, fecha_fin, periodo_escolar } = body;

    if (!numero || !nombre || !fecha_inicio || !fecha_fin || !periodo_escolar) {
      return json({ error: 'Numero, nombre, fecha_inicio, fecha_fin y periodo_escolar son requeridos' }, 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO lapsos (numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, 1, datetime("now"))`
    )
      .bind(numero, nombre, fecha_inicio, fecha_fin, periodo_escolar)
      .run();

    const created = await env.DB.prepare('SELECT * FROM lapsos WHERE id = ?').bind(result.meta.last_row_id).first();
    return json({ lapso: created, message: 'Lapso creado exitosamente' }, 201);
  } catch (error) {
    console.error('Create lapso error:', error);
    return json({ error: 'Error al crear lapso' }, 500);
  }
}

// PUT - Update lapso
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo } = body;

    if (!id) {
      return json({ error: 'ID de lapso es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM lapsos WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'Lapso no encontrado' }, 404);
    }

    await env.DB.prepare(
      `UPDATE lapsos SET numero = ?, nombre = ?, fecha_inicio = ?, fecha_fin = ?, periodo_escolar = ?, activo = ? WHERE id = ?`
    )
      .bind(
        numero !== undefined ? numero : existing.numero,
        nombre !== undefined ? nombre : existing.nombre,
        fecha_inicio !== undefined ? fecha_inicio : existing.fecha_inicio,
        fecha_fin !== undefined ? fecha_fin : existing.fecha_fin,
        periodo_escolar !== undefined ? periodo_escolar : existing.periodo_escolar,
        activo !== undefined ? activo : existing.activo,
        id
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM lapsos WHERE id = ?').bind(id).first();
    return json({ lapso: updated, message: 'Lapso actualizado exitosamente' });
  } catch (error) {
    console.error('Update lapso error:', error);
    return json({ error: 'Error al actualizar lapso' }, 500);
  }
}

// DELETE - Soft delete lapso (set activo=0)
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return json({ error: 'ID de lapso es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM lapsos WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'Lapso no encontrado' }, 404);
    }

    await env.DB.prepare('UPDATE lapsos SET activo = 0 WHERE id = ?').bind(id).run();

    return json({ message: 'Lapso desactivado exitosamente' });
  } catch (error) {
    console.error('Delete lapso error:', error);
    return json({ error: 'Error al desactivar lapso' }, 500);
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
      return json({ error: 'Método no permitido' }, 405);
  }
}
