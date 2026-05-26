// api/admin/estudiantes.js - CRUD for students
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

// Generate random alphanumeric string
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// SHA-256 hash with salt (same as auth/login.js)
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// GET - List students with pagination, filter by grado/seccion
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const grado = url.searchParams.get('grado') || null;
  const seccion = url.searchParams.get('seccion') || null;
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM students WHERE activo = 1';
    let listQuery = 'SELECT * FROM students WHERE activo = 1';
    const params = [];

    if (grado) {
      countQuery += ' AND grado = ?';
      listQuery += ' AND grado = ?';
      params.push(grado);
    }
    if (seccion) {
      countQuery += ' AND seccion = ?';
      listQuery += ' AND seccion = ?';
      params.push(seccion);
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
      students: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List students error:', error);
    return jsonResponse({ error: 'Error al listar estudiantes' }, 500);
  }
}

// POST - Create student
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const {
      cedula_escolar,
      nombre,
      apellido,
      fecha_nacimiento,
      grado,
      seccion,
      direccion,
      telefono_emergencia,
      contacto_emergencia,
      foto,
    } = body;

    if (!nombre || !apellido || !grado || !seccion) {
      return jsonResponse({ error: 'Nombre, apellido, grado y sección son requeridos' }, 400);
    }

    // Auto-generate codigo_unico: EST-YYYY-XXXX
    const year = new Date().getFullYear();
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as total FROM students WHERE codigo_unico LIKE ?"
    )
      .bind(`EST-${year}-%`)
      .first();

    const seq = (countResult.total + 1).toString().padStart(4, '0');
    const codigo_unico = `EST-${year}-${seq}`;

    // Auto-generate qr_code
    const qr_code = `QR-${codigo_unico}-${randomString(6)}`;

    let fotoKey = null;
    // If photo is provided as base64, upload to R2
    if (foto) {
      try {
        const base64Data = foto.split(',')[1] || foto;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fotoKey = `fotos/estudiantes/${codigo_unico}-${Date.now()}.jpg`;
        await env.BUCKET.put(fotoKey, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        });
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        // Continue without photo
        fotoKey = null;
      }
    }

    const result = await env.DB.prepare(
      `INSERT INTO students (cedula_escolar, nombre, apellido, fecha_nacimiento, grado, seccion, direccion, telefono_emergencia, contacto_emergencia, codigo_unico, qr_code, foto, activo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"))`
    )
      .bind(
        cedula_escolar || null,
        nombre,
        apellido,
        fecha_nacimiento || null,
        grado,
        seccion,
        direccion || null,
        telefono_emergencia || null,
        contacto_emergencia || null,
        codigo_unico,
        qr_code,
        fotoKey
      )
      .run();

    const newStudent = await env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    // Auto-create estudiante user account for login
    const studentCedula = cedula_escolar || `EST-${codigo_unico}`;
    const studentPassword = randomString(6);
    const studentHashedPassword = await hashPassword(studentPassword, env.JWT_SECRET || 'default-secret-change-me');

    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password_hash, rol, telefono, activo, estudiante_id)
         VALUES (?, ?, ?, ?, ?, 'estudiante', ?, 1, ?)`
      ).bind(
        studentCedula,
        nombre,
        apellido,
        `${codigo_unico}@estudiante.lista`,
        studentHashedPassword,
        telefono_emergencia || null,
        newStudent.id
      ).run();
    } catch (studentUserError) {
      console.error('Error creating student user:', studentUserError);
    }

    // Auto-create representante user with access link
    const repPassword = randomString(6);
    const repHashedPassword = await hashPassword(repPassword, env.JWT_SECRET || 'default-secret-change-me');
    const repCedula = `REP-${codigo_unico}`;

    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (cedula, nombre, apellido, email, password_hash, rol, telefono, activo)
         VALUES (?, ?, ?, ?, ?, 'representante', ?, 1)`
      ).bind(
        repCedula,
        `Representante de ${nombre}`,
        apellido,
        `${codigo_unico}@representante.lista`,
        repHashedPassword,
        body.telefono_representante || null
      ).run();

      const repUser = await env.DB.prepare('SELECT id FROM users WHERE cedula = ?').bind(repCedula).first();

      if (repUser) {
        // Link representante to student
        await env.DB.prepare(
          `INSERT OR IGNORE INTO parent_student (representante_id, estudiante_id, parentesco, es_principal) VALUES (?, ?, 'otro', 1)`
        ).bind(repUser.id, newStudent.id).run();
      }

      // Generate access token
      const accessToken = btoa(JSON.stringify({
        estudiante_id: newStudent.id,
        codigo: codigo_unico,
        rep_cedula: repCedula,
        rep_password: repPassword,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      }));

      const origin = new URL(request.url).origin;
      const repLink = `${origin}/pages/representante.html?token=${accessToken}`;

      return jsonResponse({
        student: newStudent,
        message: 'Estudiante creado exitosamente',
        estudiante: {
          cedula: studentCedula,
          password: studentPassword
        },
        representante: {
          cedula: repCedula,
          password: repPassword,
          token: accessToken,
          link: repLink
        }
      }, 201);
    } catch (repError) {
      console.error('Error creating representante:', repError);
      // Still return success for student creation
      return jsonResponse({ student: newStudent, message: 'Estudiante creado. Error al crear representante.' }, 201);
    }
  } catch (error) {
    console.error('Create student error:', error);
    return jsonResponse({ error: 'Error al crear estudiante' }, 500);
  }
}

// PUT - Update student
async function handlePut(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const {
      id,
      cedula_escolar,
      nombre,
      apellido,
      fecha_nacimiento,
      grado,
      seccion,
      direccion,
      telefono_emergencia,
      contacto_emergencia,
      foto,
    } = body;

    if (!id) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
    }

    let fotoKey = existing.foto;
    if (foto) {
      try {
        const base64Data = foto.split(',')[1] || foto;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fotoKey = `fotos/estudiantes/${existing.codigo_unico}-${Date.now()}.jpg`;
        await env.BUCKET.put(fotoKey, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        });
        // Delete old photo from R2
        if (existing.foto) {
          await env.BUCKET.delete(existing.foto);
        }
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
      }
    }

    await env.DB.prepare(
      `UPDATE students SET cedula_escolar = ?, nombre = ?, apellido = ?, fecha_nacimiento = ?, grado = ?, seccion = ?, direccion = ?, telefono_emergencia = ?, contacto_emergencia = ?, foto = ? WHERE id = ?`
    )
      .bind(
        cedula_escolar !== undefined ? cedula_escolar : existing.cedula_escolar,
        nombre || existing.nombre,
        apellido || existing.apellido,
        fecha_nacimiento !== undefined ? fecha_nacimiento : existing.fecha_nacimiento,
        grado || existing.grado,
        seccion || existing.seccion,
        direccion !== undefined ? direccion : existing.direccion,
        telefono_emergencia !== undefined ? telefono_emergencia : existing.telefono_emergencia,
        contacto_emergencia !== undefined ? contacto_emergencia : existing.contacto_emergencia,
        fotoKey,
        id
      )
      .run();

    const updatedStudent = await env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(id)
      .first();

    return jsonResponse({ student: updatedStudent, message: 'Estudiante actualizado exitosamente' });
  } catch (error) {
    console.error('Update student error:', error);
    return jsonResponse({ error: 'Error al actualizar estudiante' }, 500);
  }
}

// DELETE - Deactivate student (soft delete)
async function handleDelete(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
    }

    await env.DB.prepare('UPDATE students SET activo = 0 WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ message: 'Estudiante desactivado exitosamente' });
  } catch (error) {
    console.error('Delete student error:', error);
    return jsonResponse({ error: 'Error al desactivar estudiante' }, 500);
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
