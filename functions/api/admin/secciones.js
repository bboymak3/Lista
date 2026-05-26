// api/admin/secciones.js - CRUD for sections (secciones) and shifts (turnos)
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

// GET - List sections
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'listar';

  try {
    if (action === 'listar') {
      const { results } = await env.DB.prepare(
        `SELECT sec.*,
          (SELECT COUNT(*) FROM students s WHERE s.grado = sec.grado AND s.seccion = sec.nombre AND s.activo = 1) as total_estudiantes,
          (SELECT COUNT(DISTINCT sch.profesor_id) FROM schedules sch WHERE sch.seccion_id = sec.id AND sch.activo = 1) as total_profesores
         FROM sections sec
         WHERE sec.activo = 1
         ORDER BY sec.grado, sec.nombre`
      ).all();

      return jsonResponse({ secciones: results });
    }

    if (action === 'turnos') {
      // Return available shifts
      return jsonResponse({
        turnos: [
          { id: 'manana', nombre: 'Mañana' },
          { id: 'tarde', nombre: 'Tarde' },
          { id: 'nocturno', nombre: 'Nocturno' }
        ]
      });
    }

    if (action === 'resumen') {
      // Get sections with student/professor counts
      const { results } = await env.DB.prepare(
        `SELECT sec.grado, sec.nombre, sec.turno, sec.periodo_escolar,
          (SELECT COUNT(*) FROM students s WHERE s.grado = sec.grado AND s.seccion = sec.nombre AND s.activo = 1) as total_estudiantes
         FROM sections sec
         WHERE sec.activo = 1
         ORDER BY sec.grado, sec.nombre`
      ).all();

      return jsonResponse({ secciones: results });
    }

    return jsonResponse({ error: 'Acción no válida. Use: listar, turnos, resumen' }, 400);
  } catch (error) {
    console.error('List secciones error:', error);
    return jsonResponse({ error: 'Error al listar secciones' }, 500);
  }
}

// POST - Create section
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { nombre, grado, turno, periodo_escolar } = body;

    if (!nombre || !grado) {
      return jsonResponse({ error: 'Nombre y grado son requeridos' }, 400);
    }

    // Check for duplicate
    const existing = await env.DB.prepare(
      'SELECT id FROM sections WHERE nombre = ? AND grado = ? AND turno = ? AND activo = 1'
    ).bind(nombre, grado, turno || 'manana').first();

    if (existing) {
      return jsonResponse({ error: 'Ya existe una sección con ese nombre, grado y turno' }, 400);
    }

    // Get periodo_escolar from config if not provided
    let periodo = periodo_escolar;
    if (!periodo) {
      const config = await env.DB.prepare('SELECT periodo_escolar_actual FROM school_config ORDER BY id ASC LIMIT 1').first();
      periodo = config?.periodo_escolar_actual || '2024-2025';
    }

    const result = await env.DB.prepare(
      'INSERT INTO sections (nombre, grado, turno, periodo_escolar, activo, fecha_creacion) VALUES (?, ?, ?, ?, 1, datetime("now"))'
    ).bind(nombre, grado, turno || 'manana', periodo).run();

    const newSection = await env.DB.prepare('SELECT * FROM sections WHERE id = ?')
      .bind(result.meta.last_row_id).first();

    return jsonResponse({ seccion: newSection, message: 'Sección creada exitosamente' }, 201);
  } catch (error) {
    console.error('Create seccion error:', error);
    return jsonResponse({ error: 'Error al crear sección' }, 500);
  }
}

// PUT - Update section
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, nombre, grado, turno, periodo_escolar } = body;

    if (!id) {
      return jsonResponse({ error: 'ID de sección es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM sections WHERE id = ?').bind(id).first();
    if (!existing) {
      return jsonResponse({ error: 'Sección no encontrada' }, 404);
    }

    await env.DB.prepare(
      'UPDATE sections SET nombre = ?, grado = ?, turno = ?, periodo_escolar = ? WHERE id = ?'
    ).bind(
      nombre || existing.nombre,
      grado || existing.grado,
      turno !== undefined ? turno : existing.turno,
      periodo_escolar || existing.periodo_escolar,
      id
    ).run();

    const updated = await env.DB.prepare('SELECT * FROM sections WHERE id = ?').bind(id).first();
    return jsonResponse({ seccion: updated, message: 'Sección actualizada exitosamente' });
  } catch (error) {
    console.error('Update seccion error:', error);
    return jsonResponse({ error: 'Error al actualizar sección' }, 500);
  }
}

// DELETE - Deactivate section
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID de sección es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM sections WHERE id = ?').bind(id).first();
    if (!existing) {
      return jsonResponse({ error: 'Sección no encontrada' }, 404);
    }

    await env.DB.prepare('UPDATE sections SET activo = 0 WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Sección desactivada exitosamente' });
  } catch (error) {
    console.error('Delete seccion error:', error);
    return jsonResponse({ error: 'Error al desactivar sección' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET': return handleGet(request, env, user);
    case 'POST': return handlePost(request, env, user);
    case 'PUT': return handlePut(request, env, user);
    case 'DELETE': return handleDelete(request, env, user);
    default: return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
