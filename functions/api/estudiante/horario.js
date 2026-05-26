// api/estudiante/horario.js - Student's weekly schedule
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

// GET - Get student's weekly schedule
async function handleGet(request, env, user) {
  if (!checkAccess(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  const url = new URL(request.url);
  const estudiante_id = url.searchParams.get('estudiante_id');

  try {
    let targetStudentId = estudiante_id;

    // If user is a student, find their own student record
    if (user.rol === 'estudiante') {
      const student = await env.DB.prepare('SELECT id FROM students WHERE cedula_escolar = ? AND activo = 1')
        .bind(user.cedula)
        .first();
      if (student) {
        targetStudentId = student.id;
      } else {
        return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
      }
    }

    // If representante, verify access
    if (user.rol === 'representante' && targetStudentId) {
      const relation = await env.DB.prepare(
        'SELECT id FROM parent_student WHERE representante_id = ? AND estudiante_id = ?'
      ).bind(user.id, targetStudentId).first();
      if (!relation) {
        return jsonResponse({ error: 'No tiene acceso a este estudiante' }, 403);
      }
    }

    if (!targetStudentId) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    // Get student info
    const studentInfo = await env.DB.prepare(
      'SELECT id, nombre, apellido, grado, seccion, turno FROM students WHERE id = ? AND activo = 1'
    ).bind(targetStudentId).first();

    if (!studentInfo) {
      return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
    }

    // Get all schedules for this student through schedule_students
    const { results } = await env.DB.prepare(
      `SELECT sch.id, sch.dia_semana, sch.hora_inicio, sch.hora_fin, sch.aula, sch.periodo_escolar,
              sub.id as materia_id, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
              u.id as profesor_id, u.nombre as profesor_nombre, u.apellido as profesor_apellido
       FROM schedule_students ss
       INNER JOIN schedules sch ON ss.horario_id = sch.id AND sch.activo = 1
       LEFT JOIN subjects sub ON sch.materia_id = sub.id
       LEFT JOIN users u ON sch.profesor_id = u.id
       WHERE ss.estudiante_id = ?
       ORDER BY sch.dia_semana, sch.hora_inicio`
    ).bind(targetStudentId).all();

    // Organize by day
    const dias = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };
    const horarioPorDia = {};
    results.forEach(r => {
      const dia = r.dia_semana;
      if (!horarioPorDia[dia]) horarioPorDia[dia] = [];
      horarioPorDia[dia].push(r);
    });

    return jsonResponse({
      estudiante: studentInfo,
      horarios: results,
      horarioPorDia,
      dias,
    });
  } catch (error) {
    console.error('Get student schedule error:', error);
    return jsonResponse({ error: 'Error al obtener horario del estudiante' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (request.method === 'GET') {
    return handleGet(request, env, user);
  }

  return jsonResponse({ error: 'Método no permitido' }, 405);
}
