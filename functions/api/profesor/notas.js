// api/profesor/notas.js - Professor grade and evaluation management
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

function checkProfesor(user) {
  return user && (user.rol === 'profesor' || user.rol === 'admin');
}

// GET - Get evaluations / students with grades
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || null;

    // GET ?action=estudiantes_nota&materia_id=&evaluacion_id=
    if (action === 'estudiantes_nota') {
      const materia_id = url.searchParams.get('materia_id');
      const evaluacion_id = url.searchParams.get('evaluacion_id');

      if (!materia_id) {
        return json({ error: 'materia_id es requerido' }, 400);
      }

      // Validate subject belongs to this professor
      const schedule = await env.DB.prepare(
        'SELECT id FROM schedules WHERE materia_id = ? AND profesor_id = ? AND activo = 1'
      )
        .bind(materia_id, user.id)
        .first();

      if (!schedule && user.rol !== 'admin') {
        return json({ error: 'No tiene acceso a esta materia' }, 403);
      }

      // Get students enrolled in this subject
      let studentsQuery, studentsParams;
      if (evaluacion_id) {
        studentsQuery = `SELECT s.id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion,
                         g.nota, g.observaciones, g.id as grade_id
                         FROM schedule_students ss
                         INNER JOIN students s ON ss.estudiante_id = s.id
                         LEFT JOIN grades g ON g.estudiante_id = s.id AND g.evaluacion_id = ?
                         WHERE ss.horario_id IN (SELECT id FROM schedules WHERE materia_id = ? AND profesor_id = ? AND activo = 1)
                         AND s.activo = 1
                         ORDER BY s.apellido, s.nombre`;
        studentsParams = [evaluacion_id, materia_id, user.id];
      } else {
        studentsQuery = `SELECT s.id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion
                         FROM schedule_students ss
                         INNER JOIN students s ON ss.estudiante_id = s.id
                         WHERE ss.horario_id IN (SELECT id FROM schedules WHERE materia_id = ? AND profesor_id = ? AND activo = 1)
                         AND s.activo = 1
                         ORDER BY s.apellido, s.nombre`;
        studentsParams = [materia_id, user.id];
      }

      const { results } = await env.DB.prepare(studentsQuery).bind(...studentsParams).all();

      // Get evaluation details if evaluacion_id provided
      let evaluacion = null;
      if (evaluacion_id) {
        evaluacion = await env.DB.prepare('SELECT * FROM evaluations WHERE id = ?').bind(evaluacion_id).first();
      }

      return json({ estudiantes: results, evaluacion });
    }

    // Default GET: list evaluations for professor's subjects
    const materia_id = url.searchParams.get('materia_id') || null;
    const lapso_id = url.searchParams.get('lapso_id') || null;

    let query = `SELECT e.*, sub.nombre as materia_nombre, l.nombre as lapso_nombre
                 FROM evaluations e
                 INNER JOIN subjects sub ON e.materia_id = sub.id
                 INNER JOIN lapsos l ON e.lapso_id = l.id
                 WHERE e.profesor_id = ? AND e.activo = 1`;
    const params = [user.id];

    if (materia_id) {
      query += ' AND e.materia_id = ?';
      params.push(materia_id);
    }
    if (lapso_id) {
      query += ' AND e.lapso_id = ?';
      params.push(lapso_id);
    }

    query += ' ORDER BY e.fecha_aplicacion DESC, e.titulo ASC';

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return json({ evaluaciones: results });
  } catch (error) {
    console.error('Get evaluations error:', error);
    return json({ error: 'Error al obtener evaluaciones' }, 500);
  }
}

// POST - Create evaluation / Save grades
async function handlePost(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();

    // POST ?action=calificar - Save grades for an evaluation (batch upsert)
    if (body.action === 'calificar') {
      const { evaluacion_id, notas } = body;

      if (!evaluacion_id || !notas || !Array.isArray(notas)) {
        return json({ error: 'evaluacion_id y notas (array) son requeridos' }, 400);
      }

      // Validate evaluation belongs to this professor
      const evaluation = await env.DB.prepare(
        'SELECT * FROM evaluations WHERE id = ? AND profesor_id = ? AND activo = 1'
      )
        .bind(evaluacion_id, user.id)
        .first();

      if (!evaluation && user.rol !== 'admin') {
        return json({ error: 'Evaluación no encontrada o no pertenece a este profesor' }, 404);
      }

      const saved = [];
      const errors = [];

      for (const nota of notas) {
        const { estudiante_id, nota: valor, observaciones } = nota;

        if (!estudiante_id || valor === undefined) {
          errors.push({ estudiante_id, error: 'estudiante_id y nota son requeridos' });
          continue;
        }

        try {
          // Check if grade already exists (upsert)
          const existingGrade = await env.DB.prepare(
            'SELECT id FROM grades WHERE evaluacion_id = ? AND estudiante_id = ?'
          )
            .bind(evaluacion_id, estudiante_id)
            .first();

          if (existingGrade) {
            await env.DB.prepare(
              `UPDATE grades SET nota = ?, observaciones = ?, fecha_actualizacion = datetime("now") WHERE id = ?`
            )
              .bind(valor, observaciones || null, existingGrade.id)
              .run();
          } else {
            await env.DB.prepare(
              `INSERT INTO grades (evaluacion_id, estudiante_id, nota, observaciones, registrado_por, fecha_registro, fecha_actualizacion)
               VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))`
            )
              .bind(evaluacion_id, estudiante_id, valor, observaciones || null, user.id)
              .run();
          }

          saved.push({ estudiante_id, nota: valor });
        } catch (err) {
          errors.push({ estudiante_id, error: err.message });
        }
      }

      return json({
        message: `${saved.length} nota(s) guardada(s)`,
        guardadas: saved,
        errores: errors.length > 0 ? errors : undefined,
      });
    }

    // Default POST: Create evaluation
    const { materia_id, lapso_id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion } = body;

    if (!materia_id || !lapso_id || !titulo) {
      return json({ error: 'materia_id, lapso_id y titulo son requeridos' }, 400);
    }

    // Validate subject belongs to this professor
    const schedule = await env.DB.prepare(
      'SELECT id FROM schedules WHERE materia_id = ? AND profesor_id = ? AND activo = 1'
    )
      .bind(materia_id, user.id)
      .first();

    if (!schedule && user.rol !== 'admin') {
      return json({ error: 'No tiene acceso a esta materia' }, 403);
    }

    const result = await env.DB.prepare(
      `INSERT INTO evaluations (materia_id, profesor_id, lapso_id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion, activo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"))`
    )
      .bind(
        materia_id,
        user.id,
        lapso_id,
        titulo,
        descripcion || null,
        tipo || 'otro',
        ponderacion || 0,
        fecha_aplicacion || null
      )
      .run();

    const created = await env.DB.prepare('SELECT * FROM evaluations WHERE id = ?').bind(result.meta.last_row_id).first();

    return json({ evaluacion: created, message: 'Evaluación creada exitosamente' }, 201);
  } catch (error) {
    console.error('Create evaluation error:', error);
    return json({ error: 'Error al crear evaluación' }, 500);
  }
}

// PUT - Update evaluation
async function handlePut(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion } = body;

    if (!id) {
      return json({ error: 'ID de evaluación es requerido' }, 400);
    }

    const existing = await env.DB.prepare(
      'SELECT * FROM evaluations WHERE id = ? AND profesor_id = ? AND activo = 1'
    )
      .bind(id, user.id)
      .first();

    if (!existing && user.rol !== 'admin') {
      return json({ error: 'Evaluación no encontrada o no pertenece a este profesor' }, 404);
    }

    const evalToUpdate = existing || await env.DB.prepare('SELECT * FROM evaluations WHERE id = ?').bind(id).first();
    if (!evalToUpdate) {
      return json({ error: 'Evaluación no encontrada' }, 404);
    }

    await env.DB.prepare(
      `UPDATE evaluations SET titulo = ?, descripcion = ?, tipo = ?, ponderacion = ?, fecha_aplicacion = ? WHERE id = ?`
    )
      .bind(
        titulo !== undefined ? titulo : evalToUpdate.titulo,
        descripcion !== undefined ? descripcion : evalToUpdate.descripcion,
        tipo !== undefined ? tipo : evalToUpdate.tipo,
        ponderacion !== undefined ? ponderacion : evalToUpdate.ponderacion,
        fecha_aplicacion !== undefined ? fecha_aplicacion : evalToUpdate.fecha_aplicacion,
        id
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM evaluations WHERE id = ?').bind(id).first();
    return json({ evaluacion: updated, message: 'Evaluación actualizada exitosamente' });
  } catch (error) {
    console.error('Update evaluation error:', error);
    return json({ error: 'Error al actualizar evaluación' }, 500);
  }
}

// DELETE - Soft delete evaluation
async function handleDelete(request, env, user) {
  if (!checkProfesor(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return json({ error: 'ID de evaluación es requerido' }, 400);
    }

    const existing = await env.DB.prepare(
      'SELECT * FROM evaluations WHERE id = ? AND profesor_id = ? AND activo = 1'
    )
      .bind(id, user.id)
      .first();

    if (!existing && user.rol !== 'admin') {
      return json({ error: 'Evaluación no encontrada o no pertenece a este profesor' }, 404);
    }

    await env.DB.prepare('UPDATE evaluations SET activo = 0 WHERE id = ?').bind(id).run();

    return json({ message: 'Evaluación eliminada exitosamente' });
  } catch (error) {
    console.error('Delete evaluation error:', error);
    return json({ error: 'Error al eliminar evaluación' }, 500);
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
      return json({ error: 'Método no permitido' }, 405);
  }
}
