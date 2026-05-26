// api/estudiante/constancias.js - Student certificate requests
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

function checkEstudiante(user) {
  return user && (user.rol === 'estudiante' || user.rol === 'admin');
}

// Helper: find student linked to this user
async function findStudentForUser(env, user) {
  // Try to find student by cedula_escolar matching user's cedula
  let student = await env.DB.prepare(
    'SELECT id FROM students WHERE cedula_escolar = ? AND activo = 1'
  )
    .bind(user.cedula)
    .first();

  if (!student) {
    // Fallback: try user_id if column exists
    try {
      student = await env.DB.prepare(
        'SELECT id FROM students WHERE user_id = ? AND activo = 1'
      )
        .bind(user.id)
        .first();
    } catch (e) {
      // user_id column may not exist, ignore
    }
  }

  return student;
}

// GET - List student's certificates
async function handleGet(request, env, user) {
  if (!checkEstudiante(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol estudiante.' }, 403);
  }

  try {
    const student = await findStudentForUser(env, user);
    if (!student) {
      return json({ error: 'Perfil de estudiante no encontrado' }, 404);
    }

    const { results } = await env.DB.prepare(
      `SELECT c.*, u.nombre as aprobador_nombre, u.apellido as aprobador_apellido
       FROM certificates c
       LEFT JOIN users u ON c.aprobado_por = u.id
       WHERE c.estudiante_id = ?
       ORDER BY c.fecha_solicitud DESC`
    )
      .bind(student.id)
      .all();

    return json({ constancias: results });
  } catch (error) {
    console.error('List certificates error:', error);
    return json({ error: 'Error al listar constancias' }, 500);
  }
}

// POST - Request a certificate
async function handlePost(request, env, user) {
  if (!checkEstudiante(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol estudiante.' }, 403);
  }

  try {
    const student = await findStudentForUser(env, user);
    if (!student) {
      return json({ error: 'Perfil de estudiante no encontrado' }, 404);
    }

    const body = await request.json();
    const { tipo, observaciones } = body;

    if (!tipo) {
      return json({ error: 'Tipo de constancia es requerido' }, 400);
    }

    const validTypes = ['estudio', 'trabajo', 'buena_conducta', 'retiro', 'otro'];
    if (!validTypes.includes(tipo)) {
      return json({ error: `Tipo inválido. Opciones: ${validTypes.join(', ')}` }, 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO certificates (estudiante_id, tipo, estado, solicitado_por, observaciones, fecha_solicitud)
       VALUES (?, ?, 'pendiente', ?, ?, datetime("now"))`
    )
      .bind(student.id, tipo, user.id, observaciones || null)
      .run();

    const created = await env.DB.prepare('SELECT * FROM certificates WHERE id = ?').bind(result.meta.last_row_id).first();

    return json({ constancia: created, message: 'Constancia solicitada exitosamente' }, 201);
  } catch (error) {
    console.error('Request certificate error:', error);
    return json({ error: 'Error al solicitar constancia' }, 500);
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
