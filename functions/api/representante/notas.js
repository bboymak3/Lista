// api/representante/notas.js - Representative grades view for linked students
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

function checkRepresentante(user) {
  return user && (user.rol === 'representante' || user.rol === 'admin');
}

// GET - Get grades for all linked students
async function handleGet(request, env, user) {
  if (!checkRepresentante(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol representante.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const estudiante_id = url.searchParams.get('estudiante_id') || null;
    const lapso_id = url.searchParams.get('lapso_id') || null;

    // Get all students linked to this representative
    let studentQuery = `SELECT s.id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion
                        FROM parent_student ps
                        INNER JOIN students s ON ps.estudiante_id = s.id
                        WHERE ps.representante_id = ? AND s.activo = 1`;
    const studentParams = [user.id];

    if (estudiante_id) {
      studentQuery += ' AND s.id = ?';
      studentParams.push(estudiante_id);
    }

    studentQuery += ' ORDER BY s.apellido, s.nombre';

    const { results: students } = await env.DB.prepare(studentQuery).bind(...studentParams).all();

    if (students.length === 0) {
      return json({ error: 'No tiene estudiantes asociados' }, 404);
    }

    // For each student, get their grades grouped by lapso and materia
    const studentsWithGrades = [];

    for (const student of students) {
      let gradeQuery = `SELECT g.id as grade_id, g.nota, g.observaciones, g.fecha_registro, g.fecha_actualizacion,
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
      const gradeParams = [student.id];

      if (lapso_id) {
        gradeQuery += ' AND e.lapso_id = ?';
        gradeParams.push(lapso_id);
      }

      gradeQuery += ' ORDER BY l.numero ASC, sub.nombre ASC, e.titulo ASC';

      const { results: grades } = await env.DB.prepare(gradeQuery).bind(...gradeParams).all();

      // Group by lapso, then by materia
      const grouped = {};
      for (const row of grades) {
        const lapsoKey = row.lapso_id;
        const materiaKey = row.materia_id;

        if (!grouped[lapsoKey]) {
          grouped[lapsoKey] = {
            lapso_id: row.lapso_id,
            lapso_numero: row.lapso_numero,
            lapso_nombre: row.lapso_nombre,
            lapso_inicio: row.lapso_inicio,
            lapso_fin: row.lapso_fin,
            materias: {},
          };
        }

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

        grouped[lapsoKey].materias[materiaKey].evaluaciones.push({
          grade_id: row.grade_id,
          evaluacion_id: row.evaluacion_id,
          evaluacion_titulo: row.evaluacion_titulo,
          evaluacion_descripcion: row.evaluacion_descripcion,
          evaluacion_tipo: row.evaluacion_tipo,
          ponderacion: row.ponderacion,
          nota: row.nota,
          observaciones: row.observaciones,
          fecha_registro: row.fecha_registro,
        });

        const ponderacion = row.ponderacion || 0;
        const notaPonderada = (row.nota * ponderacion) / 100;
        grouped[lapsoKey].materias[materiaKey].suma_ponderada += notaPonderada;
        grouped[lapsoKey].materias[materiaKey].total_ponderacion += ponderacion;
      }

      // Calculate averages and format output
      const lapsosArray = [];
      let promedioGeneral = 0;
      let totalMaterias = 0;

      for (const lapsoKey of Object.keys(grouped)) {
        const lapso = grouped[lapsoKey];
        const materiasArray = [];
        let lapsoSumaPonderada = 0;
        let lapsoTotalPonderacion = 0;

        for (const materiaKey of Object.keys(lapso.materias)) {
          const materia = lapso.materias[materiaKey];
          if (materia.total_ponderacion > 0) {
            materia.promedio = Math.round((materia.suma_ponderada / materia.total_ponderacion) * 100 * 100) / 100;
          } else {
            const simpleAvg = materia.evaluaciones.reduce((sum, e) => sum + e.nota, 0) / materia.evaluaciones.length;
            materia.promedio = Math.round(simpleAvg * 100) / 100;
          }

          lapsoSumaPonderada += materia.promedio;
          lapsoTotalPonderacion += 1;
          promedioGeneral += materia.promedio;
          totalMaterias += 1;
          materiasArray.push(materia);
        }

        lapso.promedio_general = lapsoTotalPonderacion > 0
          ? Math.round((lapsoSumaPonderada / lapsoTotalPonderacion) * 100) / 100
          : 0;
        lapso.materias = materiasArray;
        lapsosArray.push(lapso);
      }

      studentsWithGrades.push({
        estudiante: {
          id: student.id,
          nombre: student.nombre,
          apellido: student.apellido,
          codigo_unico: student.codigo_unico,
          grado: student.grado,
          seccion: student.seccion,
        },
        lapsos: lapsosArray,
        promedio_general: totalMaterias > 0
          ? Math.round((promedioGeneral / totalMaterias) * 100) / 100
          : 0,
      });
    }

    // Send notification to representative about grade access (if new grades were recently published)
    try {
      const today = new Date().toISOString().split('T')[0];
      for (const swg of studentsWithGrades) {
        // Check if there are grades updated today for this student
        const recentGrades = await env.DB.prepare(
          `SELECT COUNT(*) as total FROM grades WHERE estudiante_id = ? AND DATE(fecha_actualizacion) = ?`
        )
          .bind(swg.estudiante.id, today)
          .first();

        if (recentGrades && recentGrades.total > 0) {
          await env.DB.prepare(
            `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion)
             VALUES (?, ?, 'nota', ?, ?, 0, datetime("now"))`
          )
            .bind(
              user.id,
              swg.estudiante.id,
              `Nuevas notas de ${swg.estudiante.nombre} ${swg.estudiante.apellido}`,
              `Se han publicado nuevas notas para ${swg.estudiante.nombre} ${swg.estudiante.apellido}. Consulte los detalles en la sección de notas.`
            )
            .run();
        }
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
      // Don't fail the request for notification errors
    }

    return json({
      representante_id: user.id,
      estudiantes: studentsWithGrades,
    });
  } catch (error) {
    console.error('Get representative grades error:', error);
    return json({ error: 'Error al obtener notas de los estudiantes' }, 500);
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
