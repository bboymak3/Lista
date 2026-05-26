// api/representante/notas.js - Representative grades (FIXED notification spam)
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

// GET - Get grades for all linked students
async function handleGet(request, env, user) {
  if (!user || user.rol !== 'representante') {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol representante.' }, 403);
  }

  const url = new URL(request.url);
  const estudiante_id = url.searchParams.get('estudiante_id') || '';
  const lapso_id = url.searchParams.get('lapso_id') || '';

  try {
    // Get linked students
    const { results: links } = await env.DB.prepare(
      `SELECT ps.estudiante_id, s.nombre, s.apellido, s.grado, s.seccion, s.codigo_unico
       FROM parent_student ps
       INNER JOIN students s ON ps.estudiante_id = s.id AND s.activo = 1
       WHERE ps.representante_id = ?`
    ).bind(user.id).all();

    if (links.length === 0) {
      return jsonResponse({ estudiantes: [], lapsos: [] });
    }

    const studentIds = links.map(l => l.estudiante_id);
    const estudiantesData = [];

    for (const link of links) {
      if (estudiante_id && link.estudiante_id !== parseInt(estudiante_id)) continue;

      // Get grades for this student grouped by lapso
      let query = `SELECT l.id as lapso_id, l.nombre as lapso_nombre, l.numero as lapso_numero,
                   sub.id as materia_id, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                   ev.id as evaluacion_id, ev.titulo as evaluacion_titulo, ev.tipo as evaluacion_tipo,
                   ev.ponderacion, ev.fecha_aplicacion,
                   g.nota, g.observaciones, g.fecha_registro
           FROM lapsos l
           LEFT JOIN evaluations ev ON ev.lapso_id = l.id AND ev.activo = 1
           LEFT JOIN subjects sub ON ev.materia_id = sub.id
           LEFT JOIN grades g ON g.evaluacion_id = ev.id AND g.estudiante_id = ?
           WHERE l.activo = 1`;
      const params = [link.estudiante_id];

      if (lapso_id) { query += ' AND l.id = ?'; params.push(lapso_id); }
      query += ' ORDER BY l.numero, sub.nombre, ev.fecha_aplicacion';

      const { results: rawGrades } = await env.DB.prepare(query).bind(...params).all();

      // Group by lapso → materia
      const lapsosMap = {};
      rawGrades.forEach(g => {
        if (!lapsosMap[g.lapso_id]) {
          lapsosMap[g.lapso_id] = {
            lapso_id: g.lapso_id,
            lapso_nombre: g.lapso_nombre,
            lapso_numero: g.lapso_numero,
            materias: {}
          };
        }
        const lapso = lapsosMap[g.lapso_id];
        if (!lapso.materias[g.materia_id] && g.materia_id) {
          lapso.materias[g.materia_id] = {
            materia_id: g.materia_id,
            materia_nombre: g.materia_nombre,
            materia_codigo: g.materia_codigo,
            evaluaciones: [],
            promedio: 0
          };
        }
        if (g.evaluacion_id) {
          lapso.materias[g.materia_id].evaluaciones.push({
            evaluacion_id: g.evaluacion_id,
            titulo: g.evaluacion_titulo,
            tipo: g.evaluacion_tipo,
            ponderacion: g.ponderacion,
            fecha: g.fecha_aplicacion,
            nota: g.nota,
            observaciones: g.observaciones
          });
        }
      });

      // Calculate averages
      const lapsos = Object.values(lapsosMap);
      lapsos.forEach(l => {
        const materias = Object.values(l.materias);
        materias.forEach(m => {
          const conNota = m.evaluaciones.filter(e => e.nota !== null && e.nota !== undefined);
          if (conNota.length > 0) {
            const totalPond = conNota.reduce((s, e) => s + (e.ponderacion || 1), 0);
            const weightedSum = conNota.reduce((s, e) => s + (e.nota * (e.ponderacion || 1)), 0);
            m.promedio = totalPond > 0 ? (weightedSum / totalPond).toFixed(2) : (conNota.reduce((s, e) => s + e.nota, 0) / conNota.length).toFixed(2);
          }
        });
        l.materias = materias;
        const conProm = materias.filter(m => m.promedio > 0);
        l.promedio_general = conProm.length > 0 ? (conProm.reduce((s, m) => s + parseFloat(m.promedio), 0) / conProm.length).toFixed(2) : 0;
      });

      estudiantesData.push({
        estudiante_id: link.estudiante_id,
        nombre: link.nombre,
        apellido: link.apellido,
        grado: link.grado,
        seccion: link.seccion,
        codigo_unico: link.codigo_unico,
        lapsos
      });
    }

    // Get available lapsos
    const { results: lapsosList } = await env.DB.prepare(
      'SELECT id, nombre, numero FROM lapsos WHERE activo = 1 ORDER BY numero'
    ).all();

    return jsonResponse({ estudiantes: estudiantesData, lapsos: lapsosList });
  } catch (error) {
    console.error('Get representante notas error:', error);
    return jsonResponse({ error: 'Error al obtener notas' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (request.method === 'GET') return handleGet(request, env, user);
  return jsonResponse({ error: 'Método no permitido' }, 405);
}
