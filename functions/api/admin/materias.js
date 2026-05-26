// api/admin/materias.js - CRUD for subjects (materias)
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

// GET - List subjects
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM subjects WHERE activo = 1'
    ).first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM schedules sch WHERE sch.materia_id = s.id AND sch.activo = 1) as total_horarios,
        (SELECT COUNT(DISTINCT sch.profesor_id) FROM schedules sch WHERE sch.materia_id = s.id AND sch.activo = 1) as total_profesores
       FROM subjects s
       WHERE s.activo = 1
       ORDER BY s.nombre
       LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all();

    return jsonResponse({
      subjects: results,
      materias: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List materias error:', error);
    return jsonResponse({ error: 'Error al listar materias' }, 500);
  }
}

// POST - Create subject
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { nombre, codigo, descripcion } = body;

    if (!nombre) {
      return jsonResponse({ error: 'El nombre de la materia es requerido' }, 400);
    }

    // Check if codigo already exists (if provided)
    if (codigo) {
      const existing = await env.DB.prepare('SELECT id FROM subjects WHERE codigo = ?')
        .bind(codigo)
        .first();
      if (existing) {
        return jsonResponse({ error: 'Ya existe una materia con ese código' }, 400);
      }
    }

    const result = await env.DB.prepare(
      'INSERT INTO subjects (nombre, codigo, descripcion, activo, fecha_creacion) VALUES (?, ?, ?, 1, datetime("now"))'
    )
      .bind(nombre, codigo || null, descripcion || null)
      .run();

    const newSubject = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return jsonResponse({ subject: newSubject, materia: newSubject, message: 'Materia creada exitosamente' }, 201);
  } catch (error) {
    console.error('Create materia error:', error);
    return jsonResponse({ error: 'Error al crear materia' }, 500);
  }
}

// PUT - Update subject
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, nombre, codigo, descripcion } = body;

    if (!id) {
      return jsonResponse({ error: 'ID de materia es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Materia no encontrada' }, 404);
    }

    // Check codigo uniqueness if changing
    if (codigo && codigo !== existing.codigo) {
      const dup = await env.DB.prepare('SELECT id FROM subjects WHERE codigo = ? AND id != ?')
        .bind(codigo, id)
        .first();
      if (dup) {
        return jsonResponse({ error: 'Ya existe otra materia con ese código' }, 400);
      }
    }

    await env.DB.prepare(
      'UPDATE subjects SET nombre = ?, codigo = ?, descripcion = ? WHERE id = ?'
    )
      .bind(
        nombre || existing.nombre,
        codigo !== undefined ? codigo : existing.codigo,
        descripcion !== undefined ? descripcion : existing.descripcion,
        id
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?')
      .bind(id)
      .first();

    return jsonResponse({ subject: updated, materia: updated, message: 'Materia actualizada exitosamente' });
  } catch (error) {
    console.error('Update materia error:', error);
    return jsonResponse({ error: 'Error al actualizar materia' }, 500);
  }
}

// DELETE - Deactivate subject
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID de materia es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM subjects WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Materia no encontrada' }, 404);
    }

    await env.DB.prepare('UPDATE subjects SET activo = 0 WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ message: 'Materia eliminada exitosamente' });
  } catch (error) {
    console.error('Delete materia error:', error);
    return jsonResponse({ error: 'Error al eliminar materia' }, 500);
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
