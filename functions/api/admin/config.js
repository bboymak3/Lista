// api/admin/config.js - School configuration with geofence validation
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

// GET - Get school config
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const config = await env.DB.prepare(
      'SELECT * FROM school_config ORDER BY id ASC LIMIT 1'
    ).first();

    return jsonResponse({ config });
  } catch (error) {
    console.error('Get config error:', error);
    return jsonResponse({ error: 'Error al obtener configuración' }, 500);
  }
}

// POST - Create or update school config (upsert)
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { nombre, direccion, latitud, longitud, radio_permitido, telefono, codigo_postal, logo_key, periodo_escolar_actual } = body;

    if (!nombre || latitud === undefined || longitud === undefined) {
      return jsonResponse({ error: 'Nombre, latitud y longitud son requeridos' }, 400);
    }

    // Validate geofence radius (150-200m as per requirement)
    let radio = parseInt(radio_permitido) || 150;
    if (radio < 50) radio = 50;
    if (radio > 500) radio = 500;
    // Recommended range: 150-200m
    if (radio < 150 || radio > 200) {
      console.warn(`Radio permitido ${radio}m fuera del rango recomendado (150-200m)`);
    }

    // Validate lat/lng ranges
    if (latitud < -90 || latitud > 90) {
      return jsonResponse({ error: 'Latitud inválida. Debe estar entre -90 y 90' }, 400);
    }
    if (longitud < -180 || longitud > 180) {
      return jsonResponse({ error: 'Longitud inválida. Debe estar entre -180 y 180' }, 400);
    }

    const existing = await env.DB.prepare('SELECT id FROM school_config ORDER BY id ASC LIMIT 1').first();

    if (existing) {
      await env.DB.prepare(
        `UPDATE school_config SET nombre = ?, direccion = ?, latitud = ?, longitud = ?, radio_permitido = ?,
         telefono = ?, codigo_postal = ?, logo_key = ?, periodo_escolar_actual = ?, fecha_actualizacion = datetime('now')
         WHERE id = ?`
      ).bind(
        nombre, direccion || null, latitud, longitud, radio,
        telefono || null, codigo_postal || null, logo_key || null,
        periodo_escolar_actual || '2024-2025', existing.id
      ).run();

      const updated = await env.DB.prepare('SELECT * FROM school_config WHERE id = ?').bind(existing.id).first();
      return jsonResponse({ config: updated, message: 'Configuración actualizada exitosamente' });
    } else {
      const result = await env.DB.prepare(
        `INSERT INTO school_config (nombre, direccion, latitud, longitud, radio_permitido, telefono, codigo_postal, logo_key, periodo_escolar_actual, fecha_actualizacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        nombre, direccion || null, latitud, longitud, radio,
        telefono || null, codigo_postal || null, logo_key || null,
        periodo_escolar_actual || '2024-2025'
      ).run();

      const newConfig = await env.DB.prepare('SELECT * FROM school_config WHERE id = ?')
        .bind(result.meta.last_row_id).first();

      return jsonResponse({ config: newConfig, message: 'Configuración creada exitosamente' }, 201);
    }
  } catch (error) {
    console.error('Save config error:', error);
    return jsonResponse({ error: 'Error al guardar configuración' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET': return handleGet(request, env, user);
    case 'POST': return handlePost(request, env, user);
    default: return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
