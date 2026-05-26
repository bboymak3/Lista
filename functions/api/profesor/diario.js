// api/profesor/diario.js - Teacher daily work log with per-class and history
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

function checkProfesor(user) {
  return user && (user.rol === 'profesor' || user.rol === 'admin');
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET - Get daily log (today or history)
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'hoy';
  const profesor_id = url.searchParams.get('profesor_id') || user.id;

  try {
    if (action === 'hoy') {
      const today = new Date().toISOString().split('T')[0];
      const diario = await env.DB.prepare(
        'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
      ).bind(profesor_id, today).first();

      return jsonResponse({ diario });

    } else if (action === 'historial') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = (page - 1) * limit;

      const countResult = await env.DB.prepare(
        'SELECT COUNT(*) as total FROM teacher_daily_log WHERE profesor_id = ?'
      ).bind(profesor_id).first();

      const { results } = await env.DB.prepare(
        'SELECT * FROM teacher_daily_log WHERE profesor_id = ? ORDER BY fecha DESC LIMIT ? OFFSET ?'
      ).bind(profesor_id, limit, offset).all();

      return jsonResponse({
        registros: results,
        pagination: { page, limit, total: countResult.total, totalPages: Math.ceil(countResult.total / limit) }
      });

    } else if (action === 'clases_hoy') {
      // Get today's classes with session info for the daily log
      const today = new Date().toISOString().split('T')[0];
      const jsDay = new Date().getDay();
      const diaSemana = jsDay === 0 ? 7 : jsDay;

      const { results } = await env.DB.prepare(
        `SELECT sch.id, sch.hora_inicio, sch.hora_fin, sch.aula,
                sub.nombre as materia_nombre,
                sec.grado as seccion_grado, sec.nombre as seccion_nombre,
                (SELECT COUNT(*) FROM schedule_students ss WHERE ss.horario_id = sch.id) as total_estudiantes,
                ats.id as sesion_id, ats.estado as sesion_estado, ats.observaciones as sesion_observaciones
         FROM schedules sch
         LEFT JOIN subjects sub ON sch.materia_id = sub.id
         LEFT JOIN sections sec ON sch.seccion_id = sec.id
         LEFT JOIN attendance_sessions ats ON ats.horario_id = sch.id AND ats.fecha = ?
         WHERE sch.profesor_id = ? AND sch.dia_semana = ? AND sch.activo = 1
         ORDER BY sch.hora_inicio`
      ).bind(today, profesor_id, diaSemana).all();

      return jsonResponse({ clases: results, fecha: today });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: hoy, historial, clases_hoy' }, 400);
    }
  } catch (error) {
    console.error('Get diario error:', error);
    return jsonResponse({ error: 'Error al obtener diario' }, 500);
  }
}

// POST - Check in (inicio de labores)
async function handlePost(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  try {
    const body = await request.json();
    const { latitud, longitud, observaciones } = body;
    const today = new Date().toISOString().split('T')[0];
    const hora = new Date().toTimeString().split(' ')[0];

    // Check if already checked in today
    const existing = await env.DB.prepare(
      'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
    ).bind(user.id, today).first();

    if (existing) {
      return jsonResponse({ error: 'Ya registró su entrada el día de hoy', diario: existing }, 400);
    }

    // Validate geolocation
    let lat = latitud, lon = longitud;
    if (lat !== undefined && lon !== undefined) {
      const config = await env.DB.prepare(
        'SELECT latitud, longitud, radio_permitido FROM school_config ORDER BY id ASC LIMIT 1'
      ).first();

      if (config) {
        const distance = haversineDistance(lat, lon, config.latitud, config.longitud);
        if (distance > config.radio_permitido) {
          return jsonResponse({
            error: `Fuera del rango permitido. Distancia: ${Math.round(distance)}m, permitido: ${config.radio_permitido}m`
          }, 403);
        }
      }
    }

    await env.DB.prepare(
      `INSERT INTO teacher_daily_log (profesor_id, fecha, hora_entrada, latitud_entrada, longitud_entrada, observaciones, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(user.id, today, hora, lat || null, lon || null, observaciones || null).run();

    const diario = await env.DB.prepare(
      'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
    ).bind(user.id, today).first();

    return jsonResponse({ diario, message: 'Entrada registrada exitosamente' }, 201);
  } catch (error) {
    console.error('Check in error:', error);
    return jsonResponse({ error: 'Error al registrar entrada' }, 500);
  }
}

// PUT - Check out (salida de labores) or update class observations
async function handlePut(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'salida') {
      const { latitud, longitud, observaciones } = body;
      const today = new Date().toISOString().split('T')[0];
      const hora = new Date().toTimeString().split(' ')[0];

      const existing = await env.DB.prepare(
        'SELECT * FROM teacher_daily_log WHERE profesor_id = ? AND fecha = ?'
      ).bind(user.id, today).first();

      if (!existing) {
        return jsonResponse({ error: 'No ha registrado su entrada el día de hoy' }, 400);
      }

      if (existing.hora_salida) {
        return jsonResponse({ error: 'Ya registró su salida el día de hoy' }, 400);
      }

      // Validate geolocation
      let lat = latitud, lon = longitud;
      if (lat !== undefined && lon !== undefined) {
        const config = await env.DB.prepare(
          'SELECT latitud, longitud, radio_permitido FROM school_config ORDER BY id ASC LIMIT 1'
        ).first();

        if (config) {
          const distance = haversineDistance(lat, lon, config.latitud, config.longitud);
          if (distance > config.radio_permitido) {
            return jsonResponse({
              error: `Fuera del rango permitido. Distancia: ${Math.round(distance)}m, permitido: ${config.radio_permitido}m`
            }, 403);
          }
        }
      }

      await env.DB.prepare(
        `UPDATE teacher_daily_log SET hora_salida = ?, latitud_salida = ?, longitud_salida = ?, observaciones = ? WHERE id = ?`
      ).bind(hora, lat || null, lon || null, observaciones || existing.observaciones, existing.id).run();

      const updated = await env.DB.prepare(
        'SELECT * FROM teacher_daily_log WHERE id = ?'
      ).bind(existing.id).first();

      return jsonResponse({ diario: updated, message: 'Salida registrada exitosamente' });

    } else if (action === 'observaciones_clase') {
      // Add observations for a specific class session
      const { sesion_id, observaciones: obsClase } = body;

      if (!sesion_id) {
        return jsonResponse({ error: 'sesion_id es requerido' }, 400);
      }

      await env.DB.prepare(
        'UPDATE attendance_sessions SET observaciones = ? WHERE id = ?'
      ).bind(obsClase || null, sesion_id).run();

      return jsonResponse({ message: 'Observaciones de clase guardadas' });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: salida u observaciones_clase' }, 400);
    }
  } catch (error) {
    console.error('Check out error:', error);
    return jsonResponse({ error: 'Error al registrar salida' }, 500);
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
    default: return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
