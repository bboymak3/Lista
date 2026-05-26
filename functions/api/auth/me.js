// api/auth/me.js - GET handler returning current user info from JWT
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  try {
    const user = context.data.user;
    if (!user) {
      return jsonResponse({ error: 'No autenticado' }, 401);
    }

    // Fetch full user info from DB
    const dbUser = await env.DB.prepare('SELECT id, cedula, rol, nombre, apellido, email, telefono, activo, fecha_creacion FROM users WHERE id = ? AND activo = 1')
      .bind(user.id)
      .first();

    if (!dbUser) {
      return jsonResponse({ error: 'Usuario no encontrado' }, 404);
    }

    return jsonResponse({ user: dbUser });
  } catch (error) {
    console.error('Me error:', error);
    return jsonResponse({ error: 'Error interno del servidor' }, 500);
  }
}
