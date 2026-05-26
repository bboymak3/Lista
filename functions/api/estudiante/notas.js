// api/estudiante/notas.js - Student grades view
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
  let student = await env.DB.prepare(
    'SELECT id FROM students WHERE cedula_escolar = ? AND activo = 1'
  )
    .bind(user.cedula)
    .first();

  if (!student) {
    try {
      student = await env.DB.prepare(
        'SELECT id FROM students WHERE user_id = ? AND activo = 1'
      )
        .bind(user.id)
        .first();
    } catch (e) {
      // user_id column may not exist
    }
  }

  return student;
}

// GET - Get student's grades grouped by lapso and materia
async function handleGet(request, env, user) {
  if (!checkEstudiante(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol estudiante.' }, 403);
  }

  try {
    const student = await findStudentForUser(env, user);
    if (!student) {
      return json({ error: 'Perfil de estudiante no encontrado' }, 404);
    }

    const url = new URL(request.url);
    const materia_id = url.searchParams.get('materia_id') || null;
    const lapso_id = url.searchParams.get('lapso_id') || null;

    // Fetch all grades with evaluation, subject, and lapso details
    let query = `SELECT g.id as grade_id, g.nota, g.observaciones, g.fecha_registro, g.fecha_actualizacion,
                 e.id as evaluacion_id, e.titulo as evaluacion_titulo, e.descripcion as evaluacion_descripcion,
                 e.tipo as evaluacion_tipo, e.ponderacion,
                 sub.id as materia_id, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                 l.id as lapso_id, l.numero as lapso_numero, l.nombre as lapso_nombre,
                 l.fecha_inicio as lapso_inicio, l.fecha_fin as lapso_fin
                 FROM grades g
                 INNER JOIN evaluations e ON g.evaluacion_id = e.id
                 INNER JOIN subjects sub ON e.materia_id = sub.id
                 INNER JOIN lapsos l ON e.lapso_id = l.id
                 WHERE g.estudiante_id = ? AND e.activo = 1`;
    const params = [student.id];

    if (materia_id) {
      query += ' AND e.materia_id = ?';
      params.push(materia_id);
    }
    if (lapso_id) {
      query += ' AND e.lapso_id = ?';
      params.push(lapso_id);
    }

    query += ' ORDER BY l.numero ASC, sub.nombre ASC, e.titulo ASC';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Group by lapso, then by materia
    const grouped = {};
    const lapsoTotals = {};

    for (const row of results) {
      const lapsoKey = row.lapso_id;
      const materiaKey = row.materia_id;

      // Initialize lapso group
      if (!grouped[lapsoKey]) {
        grouped[lapsoKey] = {
          lapso_id: row.lapso_id,
          lapso_numero: row.lapso_numero,
          lapso_nombre: row.lapso_nombre,
          lapso_inicio: row.lapso_inicio,
          lapso_fin: row.lapso_fin,
          materias: {},
          total_puntos: 0,
          total_ponderacion: 0,
        };
        lapsoTotals[lapsoKey] = { total_puntos: 0, total_ponderacion: 0 };
      }

      // Initialize materia group within lapso
      if (!grouped[lapsoKey].materias[materiaKey]) {
        grouped[lapsoKey].materias[materiaKey] = {
          materia_id: row.materia_id,
          materia_nombre: row.materia_nombre,
          materia_codigo: row.materia_codigo,
          evaluaciones: [],
          promedio: 0,
          total_ponderacion: 0,
          suma_ponderada: 0,
        };
      }

      // Add evaluation/grade detail
      const evaluacion = {
        grade_id: row.grade_id,
        evaluacion_id: row.evaluacion_id,
        evaluacion_titulo: row.evaluacion_titulo,
        evaluacion_descripcion: row.evaluacion_descripcion,
        evaluacion_tipo: row.evaluacion_tipo,
        ponderacion: row.ponderacion,
        nota: row.nota,
        observaciones: row.observaciones,
        fecha_registro: row.fecha_registro,
      };

      grouped[lapsoKey].materias[materiaKey].evaluaciones.push(evaluacion);

      // Calculate weighted contribution
      const ponderacion = row.ponderacion || 0;
      const notaPonderada = (row.nota * ponderacion) / 100;
      grouped[lapsoKey].materias[materiaKey].suma_ponderada += notaPonderada;
      grouped[lapsoKey].materias[materiaKey].total_ponderacion += ponderacion;
    }

    // Calculate averages per materia and lapso totals
    const lapsosArray = [];
    for (const lapsoKey of Object.keys(grouped)) {
      const lapso = grouped[lapsoKey];
      const materiasArray = [];
      let lapsoSumaPonderada = 0;
      let lapsoTotalPonderacion = 0;

      for (const materiaKey of Object.keys(lapso.materias)) {
        const materia = lapso.materias[materiaKey];
        // Promedio ponderado if there are ponderaciones, otherwise simple average
        if (materia.total_ponderacion > 0) {
          materia.promedio = Math.round((materia.suma_ponderada / materia.total_ponderacion) * 100 * 100) / 100;
        } else {
          const simpleAvg = materia.evaluaciones.reduce((sum, e) => sum + e.nota, 0) / materia.evaluaciones.length;
          materia.promedio = Math.round(simpleAvg * 100) / 100;
        }

        lapsoSumaPonderada += materia.promedio;
        lapsoTotalPonderacion += 1;
        materiasArray.push(materia);
      }

      // Lapso average = average of materia averages
      lapso.promedio_general = lapsoTotalPonderacion > 0
        ? Math.round((lapsoSumaPonderada / lapsoTotalPonderacion) * 100) / 100
        : 0;
      lapso.materias = materiasArray;
      delete lapso.total_puntos;
      delete lapso.total_ponderacion;
      lapsosArray.push(lapso);
    }

    return json({
      estudiante_id: student.id,
      lapsos: lapsosArray,
    });
  } catch (error) {
    console.error('Get student grades error:', error);
    return json({ error: 'Error al obtener notas del estudiante' }, 500);
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
