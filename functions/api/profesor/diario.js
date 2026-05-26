// api/profesor/diario.js - Teacher daily log (check-in/check-out)
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

function checkProfesor(user) {
  return user && (user.rol === 'profesor' || user.rol === 'admin');
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function validateGeolocation(latitud, longitud, env) {
  const config = await env.DB.prepare('SELECT latitud, longitud, radio_permitido FROM school_config ORDER BY id ASC LIMIT 1').first();
  if (!config) {
    return { valid: false, error: 'No hay configuración de escuela registrada', status: 500 };
  }

  const distance = haversineDistance(latitud, longitud, config.latitud, config.longitud);
  if (distance > config.radio_permitido) {
    return {
      valid: false,
      error: `Fuera del rango permitido. Distancia: ${Math.round(distance)}m, permitido: ${config.radio_permitido}m`,
      status: 403,
    };
  }

  return { valid: true, distance };
}

// GET - Get today's log entry for the professor
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const log = await env.DB.prepare(
      'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
    )
      .bind(user.id, today)
      .first();

    return json({ diario: log, fecha: today });
  } catch (error) {
    console.error('Get daily log error:', error);
    return json({ error: 'Error al obtener diario del profesor' }, 500);
  }
}

// POST - Start daily log (check in)
async function handlePost(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { latitud, longitud, observaciones } = body;

    if (latitud === undefined || longitud === undefined) {
      return json({ error: 'Latitud y longitud son requeridas' }, 400);
    }

    // Validate geolocation
    const geoCheck = await validateGeolocation(latitud, longitud, env);
    if (!geoCheck.valid) {
      return json({ error: geoCheck.error }, geoCheck.status);
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const existing = await env.DB.prepare(
      'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
    )
      .bind(user.id, today)
      .first();

    if (existing) {
      return json({ error: 'Ya ha registrado su entrada hoy', diario: existing }, 400);
    }

    const now = new Date();
    const horaEntrada = now.toTimeString().split(' ')[0];

    const result = await env.DB.prepare(
      `INSERT INTO teacher_daily_log (profesor_id, fecha, hora_entrada, latitud_entrada, longitud_entrada, observaciones, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, datetime("now"))`
    )
      .bind(user.id, today, horaEntrada, latitud, longitud, observaciones || null)
      .run();

    const created = await env.DB.prepare('SELECT * FROM teacher_daily_log WHERE id = ?').bind(result.meta.last_row_id).first();

    return json({ diario: created, message: 'Entrada registrada exitosamente', distancia: Math.round(geoCheck.distance) }, 201);
  } catch (error) {
    console.error('Check in error:', error);
    return json({ error: 'Error al registrar entrada' }, 500);
  }
}

// PUT - End daily log (check out)
async function handlePut(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { latitud, longitud, observaciones } = body;

    if (latitud === undefined || longitud === undefined) {
      return json({ error: 'Latitud y longitud son requeridas' }, 400);
    }

    // Validate geolocation
    const geoCheck = await validateGeolocation(latitud, longitud, env);
    if (!geoCheck.valid) {
      return json({ error: geoCheck.error }, geoCheck.status);
    }

    const today = new Date().toISOString().split('T')[0];

    const existing = await env.DB.prepare(
      'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
    )
      .bind(user.id, today)
      .first();

    if (!existing) {
      return json({ error: 'No ha registrado su entrada hoy' }, 404);
    }

    if (existing.hora_salida) {
      return json({ error: 'Ya ha registrado su salida hoy', diario: existing }, 400);
    }

    const now = new Date();
    const horaSalida = now.toTimeString().split(' ')[0];

    await env.DB.prepare(
      `UPDATE teacher_daily_log SET hora_salida = ?, latitud_salida = ?, longitud_salida = ?, observaciones = ? WHERE id = ?`
    )
      .bind(horaSalida, latitud, longitud, observaciones || existing.observaciones, existing.id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM teacher_daily_log WHERE id = ?').bind(existing.id).first();

    return json({ diario: updated, message: 'Salida registrada exitosamente', distancia: Math.round(geoCheck.distance) });
  } catch (error) {
    console.error('Check out error:', error);
    return json({ error: 'Error al registrar salida' }, 500);
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
    default:
      return json({ error: 'Método no permitido' }, 405);
  }
}
