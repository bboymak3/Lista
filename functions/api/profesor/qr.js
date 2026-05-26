// api/profesor/qr.js - QR code generation for attendance sessions
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

function randomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET ?horario_id= - Generate or retrieve QR code for a class session
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const horario_id = url.searchParams.get('horario_id');

    if (!horario_id) {
      return json({ error: 'horario_id es requerido' }, 400);
    }

    // Validate schedule belongs to this professor
    const schedule = await env.DB.prepare(
      'SELECT * FROM schedules WHERE id = ? AND profesor_id = ? AND activo = 1'
    )
      .bind(horario_id, user.id)
      .first();

    if (!schedule && user.rol !== 'admin') {
      return json({ error: 'Horario no encontrado o no pertenece a este profesor' }, 404);
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if there's an active session for this horario today
    const activeSession = await env.DB.prepare(
      `SELECT * FROM attendance_sessions WHERE horario_id = ? AND profesor_id = ? AND DATE(fecha) = ? AND estado = 'en_curso'`
    )
      .bind(horario_id, user.id, today)
      .first();

    let session;
    let isNewSession = false;

    if (activeSession) {
      // Use existing session
      session = activeSession;
    } else {
      // Create a new session
      const now = new Date();
      const horaInicio = now.toTimeString().split(' ')[0];
      const codigo = randomCode(8);

      const result = await env.DB.prepare(
        `INSERT INTO attendance_sessions (horario_id, profesor_id, fecha, hora_inicio, estado, qr_code, fecha_creacion)
         VALUES (?, ?, ?, ?, 'en_curso', ?, datetime("now"))`
      )
        .bind(horario_id, user.id, today, horaInicio, codigo)
        .run();

      session = await env.DB.prepare('SELECT * FROM attendance_sessions WHERE id = ?').bind(result.meta.last_row_id).first();
      isNewSession = true;
    }

    // Build QR data
    const qrData = JSON.stringify({
      sesion_id: session.id,
      horario_id: parseInt(horario_id),
      profesor_id: user.id,
      fecha: today,
      codigo: session.qr_code || randomCode(8),
    });

    const encodedData = encodeURIComponent(qrData);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedData}`;

    // Update session qr_code field if it doesn't have one or was just created
    if (!session.qr_code) {
      const codigo = randomCode(8);
      await env.DB.prepare('UPDATE attendance_sessions SET qr_code = ? WHERE id = ?').bind(codigo, session.id).run();
    }

    return json({
      sesion: {
        id: session.id,
        horario_id: session.horario_id,
        profesor_id: session.profesor_id,
        fecha: session.fecha,
        hora_inicio: session.hora_inicio,
        estado: session.estado,
        qr_code: session.qr_code,
      },
      qr_data: qrData,
      qr_url: qrUrl,
      nueva_sesion: isNewSession,
    });
  } catch (error) {
    console.error('QR generation error:', error);
    return json({ error: 'Error al generar código QR' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  if (method === 'GET') {
    return handleGet(request, env, user);
  }

  return json({ error: 'Método no permitido' }, 405);
}
