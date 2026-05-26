// api/admin/config.js - School configuration management
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

// GET - Get school configuration
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const config = await env.DB.prepare('SELECT * FROM school_config ORDER BY id ASC LIMIT 1').first();

    if (!config) {
      return json({ error: 'No hay configuración de escuela registrada' }, 404);
    }

    return json({ config });
  } catch (error) {
    console.error('Get school config error:', error);
    return json({ error: 'Error al obtener configuración de la escuela' }, 500);
  }
}

// POST - Create or update school configuration
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const {
      nombre,
      direccion,
      latitud,
      longitud,
      radio_permitido,
      telefono,
      codigo_postal,
      periodo_escolar_actual,
    } = body;

    if (!nombre || latitud === undefined || longitud === undefined) {
      return json({ error: 'Nombre, latitud y longitud son requeridos' }, 400);
    }

    // Check if config already exists
    const existing = await env.DB.prepare('SELECT id FROM school_config ORDER BY id ASC LIMIT 1').first();

    if (existing) {
      // Update existing config
      await env.DB.prepare(
        `UPDATE school_config SET
          nombre = ?, direccion = ?, latitud = ?, longitud = ?,
          radio_permitido = ?, telefono = ?, codigo_postal = ?,
          periodo_escolar_actual = ?, fecha_actualizacion = datetime("now")
        WHERE id = ?`
      )
        .bind(
          nombre,
          direccion || null,
          latitud,
          longitud,
          radio_permitido || 150,
          telefono || null,
          codigo_postal || null,
          periodo_escolar_actual || null,
          existing.id
        )
        .run();

      const updated = await env.DB.prepare('SELECT * FROM school_config WHERE id = ?').bind(existing.id).first();
      return json({ config: updated, message: 'Configuración actualizada exitosamente' });
    } else {
      // Create new config
      const result = await env.DB.prepare(
        `INSERT INTO school_config (nombre, direccion, latitud, longitud, radio_permitido, telefono, codigo_postal, periodo_escolar_actual, fecha_actualizacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`
      )
        .bind(
          nombre,
          direccion || null,
          latitud,
          longitud,
          radio_permitido || 150,
          telefono || null,
          codigo_postal || null,
          periodo_escolar_actual || null
        )
        .run();

      const created = await env.DB.prepare('SELECT * FROM school_config WHERE id = ?').bind(result.meta.last_row_id).first();
      return json({ config: created, message: 'Configuración creada exitosamente' }, 201);
    }
  } catch (error) {
    console.error('Save school config error:', error);
    return json({ error: 'Error al guardar configuración de la escuela' }, 500);
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
    default:
      return json({ error: 'Método no permitido' }, 405);
  }
}
