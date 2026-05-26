// api/estudiante/constancias.js - Student certificate requests with PDF download
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

function checkAccess(user) {
  return user && (user.rol === 'estudiante' || user.rol === 'admin' || user.rol === 'representante');
}

// Helper: Find student for current user
async function findStudentForUser(env, user) {
  // First try: user.cedula matches students.cedula_escolar
  let student = await env.DB.prepare(
    'SELECT id FROM students WHERE cedula_escolar = ? AND activo = 1'
  ).bind(user.cedula).first();

  if (!student) {
    // Second try: find by parent_student link if representante
    if (user.rol === 'representante') {
      const link = await env.DB.prepare(
        'SELECT estudiante_id FROM parent_student WHERE representante_id = ? LIMIT 1'
      ).bind(user.id).first();
      if (link) student = { id: link.estudiante_id };
    }
  }

  return student;
}

// GET - List student's certificates
async function handleGet(request, env, user) {
  if (!checkAccess(user)) return jsonResponse({ error: 'Acceso denegado' }, 403);

  const url = new URL(request.url);
  const estudiante_id = url.searchParams.get('estudiante_id');

  try {
    let targetStudentId = estudiante_id;
    if (user.rol === 'estudiante') {
      const student = await findStudentForUser(env, user);
      if (!student) return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
      targetStudentId = student.id;
    }

    if (!targetStudentId) return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);

    const { results } = await env.DB.prepare(
      `SELECT c.*, s.nombre as estudiante_nombre, s.apellido as estudiante_apellido
       FROM certificates c
       LEFT JOIN students s ON c.estudiante_id = s.id
       WHERE c.estudiante_id = ?
       ORDER BY c.fecha_solicitud DESC`
    ).bind(targetStudentId).all();

    // Add PDF download URL for approved certificates
    results.forEach(c => {
      c.pdf_url = c.pdf_key ? `/api/upload?key=${encodeURIComponent(c.pdf_key)}` : null;
    });

    return jsonResponse({ constancias: results });
  } catch (error) {
    console.error('Get constancias error:', error);
    return jsonResponse({ error: 'Error al obtener constancias' }, 500);
  }
}

// POST - Request new certificate
async function handlePost(request, env, user) {
  if (user.rol !== 'estudiante' && user.rol !== 'admin') {
    return jsonResponse({ error: 'Solo estudiantes pueden solicitar constancias' }, 403);
  }

  try {
    const body = await request.json();
    const { tipo, observaciones, estudiante_id } = body;

    const validTypes = ['estudio', 'trabajo', 'buena_conducta', 'retiro'];
    if (!tipo || !validTypes.includes(tipo)) {
      return jsonResponse({ error: 'Tipo de constancia inválido' }, 400);
    }

    let targetStudentId = estudiante_id;
    if (user.rol === 'estudiante') {
      const student = await findStudentForUser(env, user);
      if (!student) return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
      targetStudentId = student.id;
    }

    if (!targetStudentId) return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);

    // Check if there's already a pending certificate of the same type
    const existing = await env.DB.prepare(
      "SELECT id FROM certificates WHERE estudiante_id = ? AND tipo = ? AND estado = 'pendiente'"
    ).bind(targetStudentId, tipo).first();

    if (existing) {
      return jsonResponse({ error: 'Ya tiene una constancia de este tipo pendiente' }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO certificates (estudiante_id, tipo, estado, solicitado_por, observaciones, fecha_solicitud)
       VALUES (?, ?, 'pendiente', ?, ?, datetime('now'))`
    ).bind(targetStudentId, tipo, user.id, observaciones || null).run();

    // Notify admin
    try {
      const { results: admins } = await env.DB.prepare(
        "SELECT id FROM users WHERE rol = 'admin' AND activo = 1"
      ).all();

      const studentInfo = await env.DB.prepare(
        'SELECT nombre, apellido FROM students WHERE id = ?'
      ).bind(targetStudentId).first();

      const tipoLabels = { estudio: 'Estudio', trabajo: 'Trabajo', buena_conducta: 'Buena Conducta', retiro: 'Retiro' };

      for (const admin of admins) {
        await env.DB.prepare(
          `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion)
           VALUES (?, ?, 'general', ?, ?, 0, datetime('now'))`
        ).bind(admin.id, targetStudentId,
          `Nueva solicitud de constancia`,
          `${studentInfo?.nombre || ''} ${studentInfo?.apellido || ''} ha solicitado una constancia de ${tipoLabels[tipo] || tipo}.`
        ).run();
      }
    } catch (e) { /* ignore */ }

    return jsonResponse({ message: 'Constancia solicitada exitosamente' }, 201);
  } catch (error) {
    console.error('Request certificate error:', error);
    return jsonResponse({ error: 'Error al solicitar constancia' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (request.method === 'GET') return handleGet(request, env, user);
  if (request.method === 'POST') return handlePost(request, env, user);
  return jsonResponse({ error: 'Método no permitido' }, 405);
}
