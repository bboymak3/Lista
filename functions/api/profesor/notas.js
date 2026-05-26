// api/profesor/notas.js - Professor grade/evaluation management with lapsos
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

function checkProfesor(user) {
  return user && (user.rol === 'profesor' || user.rol === 'admin');
}

// GET - Get evaluations, lapsos, or students for grading
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado' }, 403);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'evaluaciones';
  const profesor_id = url.searchParams.get('profesor_id') || user.id;

  try {
    if (action === 'evaluaciones') {
      const materia_id = url.searchParams.get('materia_id') || '';
      const lapso_id = url.searchParams.get('lapso_id') || '';

      let query = `SELECT ev.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                   l.nombre as lapso_nombre, l.numero as lapso_numero
                   FROM evaluations ev
                   LEFT JOIN subjects sub ON ev.materia_id = sub.id
                   LEFT JOIN lapsos l ON ev.lapso_id = l.id
                   WHERE ev.profesor_id = ? AND ev.activo = 1`;
      const params = [profesor_id];

      if (materia_id) { query += ' AND ev.materia_id = ?'; params.push(materia_id); }
      if (lapso_id) { query += ' AND ev.lapso_id = ?'; params.push(lapso_id); }

      query += ' ORDER BY ev.fecha_aplicacion DESC';

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse({ evaluaciones: results });

    } else if (action === 'estudiantes_nota') {
      const evaluacion_id = url.searchParams.get('evaluacion_id');
      if (!evaluacion_id) return jsonResponse({ error: 'evaluacion_id es requerido' }, 400);

      const evaluacion = await env.DB.prepare(
        'SELECT * FROM evaluations WHERE id = ? AND profesor_id = ? AND activo = 1'
      ).bind(evaluacion_id, profesor_id).first();

      if (!evaluacion) return jsonResponse({ error: 'Evaluación no encontrada' }, 404);

      // Get students from the schedule assigned to this evaluation's materia
      const { results } = await env.DB.prepare(
        `SELECT s.id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion,
                g.nota, g.observaciones
         FROM schedule_students ss
         INNER JOIN schedules sch ON ss.horario_id = sch.id AND sch.materia_id = ? AND sch.activo = 1
         INNER JOIN students s ON ss.estudiante_id = s.id AND s.activo = 1
         LEFT JOIN grades g ON g.evaluacion_id = ? AND g.estudiante_id = s.id
         GROUP BY s.id
         ORDER BY s.apellido, s.nombre`
      ).bind(evaluacion.materia_id, evaluacion_id).all();

      return jsonResponse({ evaluacion, estudiantes: results });

    } else if (action === 'lapsos') {
      // Professor can also view/create lapsos
      const periodo = url.searchParams.get('periodo_escolar') || '';
      let query = 'SELECT * FROM lapsos WHERE activo = 1';
      const params = [];
      if (periodo) { query += ' AND periodo_escolar = ?'; params.push(periodo); }
      query += ' ORDER BY numero';

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse({ lapsos: results });

    } else if (action === 'resumen_notas') {
      // Summary of grades by lapso for professor's subjects
      const { results } = await env.DB.prepare(
        `SELECT l.id as lapso_id, l.nombre as lapso_nombre, l.numero as lapso_numero,
                sub.id as materia_id, sub.nombre as materia_nombre,
                COUNT(DISTINCT ev.id) as total_evaluaciones,
                COUNT(g.id) as total_notas,
                ROUND(AVG(g.nota), 2) as promedio
         FROM lapsos l
         CROSS JOIN schedules sch ON sch.profesor_id = ? AND sch.activo = 1
         LEFT JOIN subjects sub ON sch.materia_id = sub.id
         LEFT JOIN evaluations ev ON ev.lapso_id = l.id AND ev.materia_id = sub.id AND ev.activo = 1
         LEFT JOIN grades g ON g.evaluacion_id = ev.id
         WHERE l.activo = 1
         GROUP BY l.id, sub.id
         ORDER BY l.numero, sub.nombre`
      ).bind(profesor_id).all();

      return jsonResponse({ resumen: results });

    } else {
      return jsonResponse({ error: 'Acción no válida' }, 400);
    }
  } catch (error) {
    console.error('Get notas error:', error);
    return jsonResponse({ error: 'Error al obtener notas' }, 500);
  }
}

// POST - Create evaluation, save grades, or create lapso
async function handlePost(request, env, user) {
  if (!checkProfesor(user)) return jsonResponse({ error: 'Acceso denegado' }, 403);

  try {
    const body = await request.json();
    const { action } = body;
    const profesor_id = user.id;

    // Create lapso
    if (action === 'crear_lapso') {
      const { numero, nombre, fecha_inicio, fecha_fin, periodo_escolar } = body;
      if (!numero || !nombre || !fecha_inicio || !fecha_fin) {
        return jsonResponse({ error: 'Todos los campos del lapso son requeridos' }, 400);
      }

      let periodo = periodo_escolar;
      if (!periodo) {
        const config = await env.DB.prepare('SELECT periodo_escolar_actual FROM school_config ORDER BY id ASC LIMIT 1').first();
        periodo = config?.periodo_escolar_actual || '2024-2025';
      }

      const result = await env.DB.prepare(
        'INSERT INTO lapsos (numero, nombre, fecha_inicio, fecha_fin, periodo_escolar, activo, fecha_creacion) VALUES (?, ?, ?, ?, ?, 1, datetime("now"))'
      ).bind(numero, nombre, fecha_inicio, fecha_fin, periodo).run();

      return jsonResponse({ lapso_id: result.meta.last_row_id, message: 'Lapso creado exitosamente' }, 201);
    }

    // Save grades (calificar)
    if (action === 'calificar' || body.notas) {
      const { evaluacion_id, notas } = body;
      if (!evaluacion_id || !notas || !Array.isArray(notas)) {
        return jsonResponse({ error: 'evaluacion_id y notas son requeridos' }, 400);
      }

      const saved = [];
      const errors = [];

      for (const n of notas) {
        try {
          const existing = await env.DB.prepare(
            'SELECT id FROM grades WHERE evaluacion_id = ? AND estudiante_id = ?'
          ).bind(evaluacion_id, n.estudiante_id).first();

          if (existing) {
            await env.DB.prepare(
              'UPDATE grades SET nota = ?, observaciones = ?, fecha_actualizacion = datetime("now") WHERE id = ?'
            ).bind(n.nota, n.observaciones || null, existing.id).run();
          } else {
            await env.DB.prepare(
              'INSERT INTO grades (evaluacion_id, estudiante_id, nota, observaciones, registrado_por, fecha_registro) VALUES (?, ?, ?, ?, ?, datetime("now"))'
            ).bind(evaluacion_id, n.estudiante_id, n.nota, n.observaciones || null, profesor_id).run();
          }
          saved.push(n.estudiante_id);

          // Notify representatives
          const { results: parents } = await env.DB.prepare(
            `SELECT u.id FROM parent_student ps INNER JOIN users u ON ps.representante_id = u.id WHERE ps.estudiante_id = ? AND u.activo = 1`
          ).bind(n.estudiante_id).all();

          for (const parent of parents) {
            await env.DB.prepare(
              `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, 'nota', ?, ?, 0, datetime('now'))`
            ).bind(parent.id, n.estudiante_id, 'Nueva calificación registrada',
              `Se ha registrado una nueva nota para la evaluación. Calificación: ${n.nota}`
            ).run();
          }
        } catch (e) {
          errors.push({ estudiante_id: n.estudiante_id, error: e.message });
        }
      }

      return jsonResponse({ message: `${saved.length} nota(s) guardada(s)`, saved, errors: errors.length ? errors : undefined });
    }

    // Enviar calificaciones (send grade notifications to representatives)
    if (action === 'enviar_calificaciones') {
      const { evaluacion_id } = body;
      if (!evaluacion_id) {
        return jsonResponse({ error: 'evaluacion_id es requerido' }, 400);
      }

      const evaluacion = await env.DB.prepare(
        'SELECT * FROM evaluations WHERE id = ? AND profesor_id = ? AND activo = 1'
      ).bind(evaluacion_id, profesor_id).first();

      if (!evaluacion) return jsonResponse({ error: 'Evaluación no encontrada' }, 404);

      // Get all grades for this evaluation
      const { results: grades } = await env.DB.prepare(
        `SELECT g.estudiante_id, g.nota, s.nombre as estudiante_nombre, s.apellido as estudiante_apellido
         FROM grades g
         INNER JOIN students s ON g.estudiante_id = s.id AND s.activo = 1
         WHERE g.evaluacion_id = ?`
      ).bind(evaluacion_id).all();

      if (grades.length === 0) {
        return jsonResponse({ error: 'No hay calificaciones registradas para esta evaluación' }, 400);
      }

      // Get subject name
      const subject = await env.DB.prepare('SELECT nombre FROM subjects WHERE id = ?').bind(evaluacion.materia_id).first();

      let notificacionesEnviadas = 0;
      for (const grade of grades) {
        // Find representatives for this student
        const { results: parents } = await env.DB.prepare(
          `SELECT u.id FROM parent_student ps INNER JOIN users u ON ps.representante_id = u.id WHERE ps.estudiante_id = ? AND u.activo = 1`
        ).bind(grade.estudiante_id).all();

        for (const parent of parents) {
          // Check if notification already sent for this evaluation
          const existing = await env.DB.prepare(
            `SELECT id FROM notifications WHERE representante_id = ? AND estudiante_id = ? AND tipo = 'nota' AND mensaje LIKE ?`
          ).bind(parent.id, grade.estudiante_id, `%evaluación "${evaluacion.titulo}"%`).first();

          if (!existing) {
            await env.DB.prepare(
              `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, 'nota', ?, ?, 0, datetime('now'))`
            ).bind(
              parent.id,
              grade.estudiante_id,
              `Calificación publicada: ${evaluacion.titulo}`,
              `Se ha publicado la calificación de ${grade.estudiante_nombre} ${grade.estudiante_apellido} en la evaluación "${evaluacion.titulo}" de ${subject?.nombre || 'Materia'}. Nota: ${grade.nota}`
            ).run();
            notificacionesEnviadas++;
          }
        }
      }

      return jsonResponse({ message: `${notificacionesEnviadas} notificación(es) enviada(s) a representantes`, notificaciones: notificacionesEnviadas });
    }

    // Create evaluation
    const { materia_id, lapso_id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion } = body;
    if (!materia_id || !lapso_id || !titulo) {
      return jsonResponse({ error: 'Materia, lapso y título son requeridos' }, 400);
    }

    const result = await env.DB.prepare(
      'INSERT INTO evaluations (materia_id, profesor_id, lapso_id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion, activo, fecha_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"))'
    ).bind(materia_id, profesor_id, lapso_id, titulo, descripcion || null, tipo || 'examen', ponderacion || 0, fecha_aplicacion || null).run();

    return jsonResponse({ evaluacion_id: result.meta.last_row_id, message: 'Evaluación creada exitosamente' }, 201);
  } catch (error) {
    console.error('Post notas error:', error);
    return jsonResponse({ error: 'Error al guardar' }, 500);
  }
}

// PUT - Update evaluation
async function handlePut(request, env, user) {
  if (!checkProfesor(user)) return jsonResponse({ error: 'Acceso denegado' }, 403);

  try {
    const body = await request.json();
    const { id, titulo, descripcion, tipo, ponderacion, fecha_aplicacion } = body;
    if (!id) return jsonResponse({ error: 'ID es requerido' }, 400);

    const existing = await env.DB.prepare('SELECT * FROM evaluations WHERE id = ? AND profesor_id = ?')
      .bind(id, user.id).first();
    if (!existing) return jsonResponse({ error: 'Evaluación no encontrada' }, 404);

    await env.DB.prepare(
      'UPDATE evaluations SET titulo = ?, descripcion = ?, tipo = ?, ponderacion = ?, fecha_aplicacion = ? WHERE id = ?'
    ).bind(titulo || existing.titulo, descripcion !== undefined ? descripcion : existing.descripcion,
      tipo || existing.tipo, ponderacion !== undefined ? ponderacion : existing.ponderacion,
      fecha_aplicacion !== undefined ? fecha_aplicacion : existing.fecha_aplicacion, id).run();

    return jsonResponse({ message: 'Evaluación actualizada' });
  } catch (error) {
    console.error('Update evaluation error:', error);
    return jsonResponse({ error: 'Error al actualizar' }, 500);
  }
}

// DELETE - Delete evaluation or lapso
async function handleDelete(request, env, user) {
  if (!checkProfesor(user)) return jsonResponse({ error: 'Acceso denegado' }, 403);

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'evaluacion';
    const id = url.searchParams.get('id');

    if (!id) return jsonResponse({ error: 'ID es requerido' }, 400);

    if (action === 'lapso') {
      await env.DB.prepare('UPDATE lapsos SET activo = 0 WHERE id = ?').bind(id).run();
      return jsonResponse({ message: 'Lapso eliminado exitosamente' });
    }

    const existing = await env.DB.prepare('SELECT * FROM evaluations WHERE id = ? AND profesor_id = ?')
      .bind(id, user.id).first();
    if (!existing) return jsonResponse({ error: 'Evaluación no encontrada' }, 404);

    // Delete associated grades first
    await env.DB.prepare('DELETE FROM grades WHERE evaluacion_id = ?').bind(id).run();
    await env.DB.prepare('UPDATE evaluations SET activo = 0 WHERE id = ?').bind(id).run();

    return jsonResponse({ message: 'Evaluación y notas eliminadas' });
  } catch (error) {
    console.error('Delete error:', error);
    return jsonResponse({ error: 'Error al eliminar' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET': return handleGet(request, env, user);
    case 'POST': return handlePost(request, env, user);
    case 'PUT': return handlePut(request, env, user);
    case 'DELETE': return handleDelete(request, env, user);
    default: return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
