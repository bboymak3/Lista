// api/representante/estudiantes.js - Representative's students with attendance summary
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

// GET - Get representative's students with attendance summary
async function handleGet(request, env, user) {
  if (!checkRepresentante(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol representante.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const representante_id = url.searchParams.get('representante_id') || user.id;

    // Admin can query any representative's students
    if (user.rol !== 'admin' && parseInt(representante_id) !== user.id) {
      return jsonResponse({ error: 'Solo puede ver sus propios estudiantes' }, 403);
    }

    // Get students linked to this representative
    const { results: studentLinks } = await env.DB.prepare(
      `SELECT s.id, s.cedula_escolar, s.nombre, s.apellido, s.fecha_nacimiento,
              s.grado, s.seccion, s.turno, s.direccion, s.telefono_emergencia,
              s.codigo_unico, s.qr_code, s.foto_key, s.activo, ps.parentesco
       FROM parent_student ps
       INNER JOIN students s ON ps.estudiante_id = s.id
       WHERE ps.representante_id = ? AND s.activo = 1
       ORDER BY s.apellido, s.nombre`
    )
      .bind(representante_id)
      .all();

    // For each student, get attendance summary
    const studentsWithSummary = [];

    for (const student of studentLinks) {
      const summary = await env.DB.prepare(
        `SELECT
           COUNT(CASE WHEN ar.estado = 'presente' THEN 1 END) as total_presente,
           COUNT(CASE WHEN ar.estado = 'ausente' THEN 1 END) as total_ausente,
           COUNT(CASE WHEN ar.estado = 'tardanza' THEN 1 END) as total_tardanza,
           COUNT(CASE WHEN ar.estado = 'justificado' THEN 1 END) as total_justificado,
           COUNT(*) as total_registros
         FROM attendance_records ar
         WHERE ar.estudiante_id = ?`
      )
        .bind(student.id)
        .first();

      // Get recent attendance records (last 5)
      const { results: recentRecords } = await env.DB.prepare(
        `SELECT ar.estado, ar.observaciones, ar.hora_registro,
                sub.nombre as materia_nombre, s.dia_semana, s.hora_inicio
         FROM attendance_records ar
         INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
         INNER JOIN schedules s ON ats.horario_id = s.id
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         WHERE ar.estudiante_id = ?
         ORDER BY ar.fecha_registro DESC
         LIMIT 5`
      )
        .bind(student.id)
        .all();

      studentsWithSummary.push({
        ...student,
        resumen_asistencia: summary,
        registros_recientes: recentRecords,
      });
    }

    return jsonResponse({
      estudiantes: studentsWithSummary,
      total: studentsWithSummary.length,
    });
  } catch (error) {
    console.error('Get representative students error:', error);
    return jsonResponse({ error: 'Error al obtener estudiantes del representante' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  return handleGet(request, env, user);
}
