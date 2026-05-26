// api/auth/login.js - POST handler for login
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

// SHA-256 hash with salt
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Base64url encode
function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Create JWT
async function createJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`)
  );

  const signatureB64 = base64urlEncode(signature);
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  try {
    const body = await request.json();
    const { cedula, password } = body;

    if (!cedula || !password) {
      return jsonResponse({ error: 'Cédula y contraseña son requeridas' }, 400);
    }

    // Look up user by cedula
    const user = await env.DB.prepare('SELECT * FROM users WHERE cedula = ? AND activo = 1')
      .bind(cedula)
      .first();

    if (!user) {
      return jsonResponse({ error: 'Credenciales inválidas' }, 401);
    }

    // Hash the provided password with the same salt (JWT_SECRET)
    const jwtSecret = env.JWT_SECRET || 'default-secret-change-me';
    const hashedPassword = await hashPassword(password, jwtSecret);

    if (hashedPassword !== user.password) {
      return jsonResponse({ error: 'Credenciales inválidas' }, 401);
    }

    // Create JWT token
    const payload = {
      id: user.id,
      cedula: user.cedula,
      rol: user.rol,
      nombre: user.nombre,
      apellido: user.apellido,
      estudiante_id: user.estudiante_id || null,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    };

    const token = await createJWT(payload, jwtSecret);

    return jsonResponse({
      token,
      user: {
        id: user.id,
        cedula: user.cedula,
        rol: user.rol,
        nombre: user.nombre,
        apellido: user.apellido,
        estudiante_id: user.estudiante_id || null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Error interno del servidor' }, 500);
  }
}
