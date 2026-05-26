// api/admin/usuarios.js - CRUD for users
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

function checkAdmin(user) {
  return user && user.rol === 'admin';
}

// GET - List all users with pagination, filter by rol
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const rol = url.searchParams.get('rol') || null;
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE activo = 1';
    let listQuery = 'SELECT id, cedula, rol, nombre, apellido, email, telefono, activo, fecha_creacion FROM users WHERE activo = 1';
    const params = [];

    if (rol) {
      countQuery += ' AND rol = ?';
      listQuery += ' AND rol = ?';
      params.push(rol);
    }

    listQuery += ' ORDER BY fecha_creacion DESC LIMIT ? OFFSET ?';

    const countResult = await env.DB.prepare(countQuery)
      .bind(...params)
      .first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(listQuery)
      .bind(...params, limit, offset)
      .all();

    return jsonResponse({
      users: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    return jsonResponse({ error: 'Error al listar usuarios' }, 500);
  }
}

// POST - Create new user
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { cedula, password, rol, nombre, apellido, email, telefono } = body;

    if (!cedula || !password || !rol || !nombre || !apellido) {
      return jsonResponse({ error: 'Cédula, contraseña, rol, nombre y apellido son requeridos' }, 400);
    }

    const validRoles = ['admin', 'profesor', 'representante', 'estudiante'];
    if (!validRoles.includes(rol)) {
      return jsonResponse({ error: 'Rol inválido. Debe ser: admin, profesor, representante o estudiante' }, 400);
    }

    // Check if cedula already exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE cedula = ?')
      .bind(cedula)
      .first();

    if (existing) {
      return jsonResponse({ error: 'Ya existe un usuario con esa cédula' }, 400);
    }

    // Hash password
    const jwtSecret = env.JWT_SECRET || 'default-secret-change-me';
    const hashedPassword = await hashPassword(password, jwtSecret);

    const result = await env.DB.prepare(
      'INSERT INTO users (cedula, password, rol, nombre, apellido, email, telefono, activo, fecha_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime("now"))'
    )
      .bind(cedula, hashedPassword, rol, nombre, apellido, email || null, telefono || null)
      .run();

    const newUser = await env.DB.prepare('SELECT id, cedula, rol, nombre, apellido, email, telefono, activo, fecha_creacion FROM users WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return jsonResponse({ user: newUser, message: 'Usuario creado exitosamente' }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return jsonResponse({ error: 'Error al crear usuario' }, 500);
  }
}

// PUT - Update user
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, cedula, rol, nombre, apellido, email, telefono, password } = body;

    if (!id) {
      return jsonResponse({ error: 'ID de usuario es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Usuario no encontrado' }, 404);
    }

    const jwtSecret = env.JWT_SECRET || 'default-secret-change-me';
    let hashedPassword = existing.password;
    if (password) {
      hashedPassword = await hashPassword(password, jwtSecret);
    }

    await env.DB.prepare(
      'UPDATE users SET cedula = ?, rol = ?, nombre = ?, apellido = ?, email = ?, telefono = ?, password = ? WHERE id = ?'
    )
      .bind(
        cedula || existing.cedula,
        rol || existing.rol,
        nombre || existing.nombre,
        apellido || existing.apellido,
        email !== undefined ? email : existing.email,
        telefono !== undefined ? telefono : existing.telefono,
        hashedPassword,
        id
      )
      .run();

    const updatedUser = await env.DB.prepare('SELECT id, cedula, rol, nombre, apellido, email, telefono, activo, fecha_creacion FROM users WHERE id = ?')
      .bind(id)
      .first();

    return jsonResponse({ user: updatedUser, message: 'Usuario actualizado exitosamente' });
  } catch (error) {
    console.error('Update user error:', error);
    return jsonResponse({ error: 'Error al actualizar usuario' }, 500);
  }
}

// DELETE - Deactivate user (soft delete)
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID de usuario es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Usuario no encontrado' }, 404);
    }

    await env.DB.prepare('UPDATE users SET activo = 0 WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ message: 'Usuario desactivado exitosamente' });
  } catch (error) {
    console.error('Delete user error:', error);
    return jsonResponse({ error: 'Error al desactivar usuario' }, 500);
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
