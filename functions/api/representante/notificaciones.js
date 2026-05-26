// api/representante/notificaciones.js - Notifications for representatives
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

function checkRepresentante(user) {
  return user && (user.rol === 'representante' || user.rol === 'admin');
}

// GET - Get notifications for representative or unread count
async function handleGet(request, env, user) {
  if (!checkRepresentante(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol representante.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'lista';
    const representante_id = url.searchParams.get('representante_id') || user.id;

    // Admin can query any representative's notifications
    if (user.rol !== 'admin' && parseInt(representante_id) !== user.id) {
      return jsonResponse({ error: 'Solo puede ver sus propias notificaciones' }, 403);
    }

    if (action === 'no_leidas') {
      // Get unread notification count
      const result = await env.DB.prepare(
        'SELECT COUNT(*) as total FROM notifications WHERE representante_id = ? AND leida = 0'
      )
        .bind(representante_id)
        .first();

      return jsonResponse({ no_leidas: result.total });

    } else if (action === 'lista') {
      // Get notifications with pagination and filter
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const leida = url.searchParams.get('leida'); // '0', '1', or null (all)
      const offset = (page - 1) * limit;

      let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE representante_id = ?';
      let listQuery = `SELECT n.*, s.nombre as estudiante_nombre, s.apellido as estudiante_apellido, s.codigo_unico
                       FROM notifications n
                       LEFT JOIN students s ON n.estudiante_id = s.id
                       WHERE n.representante_id = ?`;
      const params = [representante_id];

      if (leida !== null && leida !== undefined && leida !== '') {
        countQuery += ' AND leida = ?';
        listQuery += ' AND n.leida = ?';
        params.push(parseInt(leida));
      }

      listQuery += ' ORDER BY n.fecha_creacion DESC LIMIT ? OFFSET ?';

      const countResult = await env.DB.prepare(countQuery)
        .bind(...params)
        .first();
      const total = countResult.total;

      const { results } = await env.DB.prepare(listQuery)
        .bind(...params, limit, offset)
        .all();

      return jsonResponse({
        notificaciones: results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: lista, no_leidas' }, 400);
    }
  } catch (error) {
    console.error('Get notifications error:', error);
    return jsonResponse({ error: 'Error al obtener notificaciones' }, 500);
  }
}

// PUT - Mark notification as read
async function handlePut(request, env, user) {
  if (!checkRepresentante(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol representante.' }, 403);
  }

  try {
    const body = await request.json();
    const { notificacion_id, marcar_todas } = body;

    if (marcar_todas) {
      // Mark all notifications as read for this representative
      await env.DB.prepare(
        'UPDATE notifications SET leida = 1, fecha_lectura = datetime("now") WHERE representante_id = ? AND leida = 0'
      )
        .bind(user.id)
        .run();

      return jsonResponse({ message: 'Todas las notificaciones marcadas como leídas' });
    }

    if (!notificacion_id) {
      return jsonResponse({ error: 'ID de notificación es requerido' }, 400);
    }

    // Verify notification belongs to this user
    const notification = await env.DB.prepare(
      'SELECT * FROM notifications WHERE id = ? AND representante_id = ?'
    )
      .bind(notificacion_id, user.id)
      .first();

    if (!notification) {
      return jsonResponse({ error: 'Notificación no encontrada' }, 404);
    }

    await env.DB.prepare(
      'UPDATE notifications SET leida = 1, fecha_lectura = datetime("now") WHERE id = ?'
    )
      .bind(notificacion_id)
      .run();

    return jsonResponse({ message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Mark notification error:', error);
    return jsonResponse({ error: 'Error al marcar notificación' }, 500);
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
    default:
      return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
