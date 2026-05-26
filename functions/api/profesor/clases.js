// api/profesor/clases.js - Professor's classes, sessions, and weekly schedule
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

// Map JS day (0=Sunday) to database dia_semana (1=Monday, 7=Sunday)
function getDiaSemana() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// GET - Get professor's schedules
async function handleGet(request, env, user) {
  if (!checkProfesor(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol profesor.' }, 403);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'hoy';
  const profesor_id = url.searchParams.get('profesor_id') || user.id;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    if (action === 'hoy') {
      // Get today's schedules for the professor
      const diaSemana = getDiaSemana();

      const { results } = await env.DB.prepare(
        `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                sec.id as seccion_id, sec.nombre as seccion_nombre, sec.grado as seccion_grado, sec.turno as seccion_turno,
                (SELECT COUNT(*) FROM schedule_students ss WHERE ss.horario_id = s.id) as total_estudiantes
         FROM schedules s
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         LEFT JOIN sections sec ON s.seccion_id = sec.id
         WHERE s.profesor_id = ? AND s.dia_semana = ? AND s.activo = 1
         ORDER BY s.hora_inicio`
      )
        .bind(profesor_id, diaSemana)
        .all();

      // Add section display info and check for existing sessions today
      const today = new Date().toISOString().split('T')[0];
      for (const schedule of results) {
        // Build section display string
        if (schedule.seccion_grado && schedule.seccion_nombre) {
          schedule.seccion = `${schedule.seccion_grado}° "${schedule.seccion_nombre}"`;
        } else {
          schedule.seccion = '-';
        }

        const session = await env.DB.prepare(
          `SELECT id, estado, hora_inicio, hora_fin, qr_code FROM attendance_sessions
           WHERE horario_id = ? AND fecha = ?`
        )
          .bind(schedule.id, today)
          .first();

        schedule.sesion_hoy = session || null;
      }

      return jsonResponse({ clases: results, dia: diaSemana, fecha: today });

    } else if (action === 'semana') {
      // Get full weekly schedule for the professor
      const { results } = await env.DB.prepare(
        `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                sec.id as seccion_id, sec.nombre as seccion_nombre, sec.grado as seccion_grado, sec.turno as seccion_turno,
                (SELECT COUNT(*) FROM schedule_students ss WHERE ss.horario_id = s.id) as total_estudiantes
         FROM schedules s
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         LEFT JOIN sections sec ON s.seccion_id = sec.id
         WHERE s.profesor_id = ? AND s.activo = 1
         ORDER BY s.dia_semana, s.hora_inicio`
      )
        .bind(profesor_id)
        .all();

      // Add section display info
      results.forEach(s => {
        if (s.seccion_grado && s.seccion_nombre) {
          s.seccion = `${s.seccion_grado}° "${s.seccion_nombre}"`;
        } else {
          s.seccion = '-';
        }
      });

      // Organize by day
      const dias = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };
      const horarioPorDia = {};
      results.forEach(r => {
        const dia = r.dia_semana;
        if (!horarioPorDia[dia]) horarioPorDia[dia] = [];
        horarioPorDia[dia].push(r);
      });

      return jsonResponse({ clases: results, horarioPorDia, dias });

    } else if (action === 'historial') {
      // Get session history for professor
      const countResult = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM attendance_sessions ats
         INNER JOIN schedules s ON ats.horario_id = s.id
         WHERE s.profesor_id = ?`
      )
        .bind(profesor_id)
        .first();

      const total = countResult.total;

      const { results } = await env.DB.prepare(
        `SELECT ats.*, s.dia_semana, s.hora_inicio, s.hora_fin, s.aula,
                sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                sec.nombre as seccion_nombre, sec.grado as seccion_grado,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.sesion_id = ats.id AND ar.estado = 'presente') as presentes,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.sesion_id = ats.id AND ar.estado = 'ausente') as ausentes,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.sesion_id = ats.id AND ar.estado = 'tardanza') as tardanzas,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.sesion_id = ats.id) as total
         FROM attendance_sessions ats
         INNER JOIN schedules s ON ats.horario_id = s.id
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         LEFT JOIN sections sec ON s.seccion_id = sec.id
         WHERE s.profesor_id = ?
         ORDER BY ats.fecha_creacion DESC
         LIMIT ? OFFSET ?`
      )
        .bind(profesor_id, limit, offset)
        .all();

      return jsonResponse({
        sesiones: results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });

    } else if (action === 'todos') {
      // Get all schedules for the professor (not just today)
      const { results } = await env.DB.prepare(
        `SELECT s.*, sub.nombre as materia_nombre, sub.codigo as materia_codigo,
                sec.id as seccion_id, sec.nombre as seccion_nombre, sec.grado as seccion_grado, sec.turno as seccion_turno,
                (SELECT COUNT(*) FROM schedule_students ss WHERE ss.horario_id = s.id) as total_estudiantes
         FROM schedules s
         LEFT JOIN subjects sub ON s.materia_id = sub.id
         LEFT JOIN sections sec ON s.seccion_id = sec.id
         WHERE s.profesor_id = ? AND s.activo = 1
         ORDER BY s.dia_semana, s.hora_inicio`
      )
        .bind(profesor_id)
        .all();

      results.forEach(s => {
        if (s.seccion_grado && s.seccion_nombre) {
          s.seccion = `${s.seccion_grado}° "${s.seccion_nombre}"`;
        } else {
          s.seccion = '-';
        }
      });

      return jsonResponse({ clases: results });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: hoy, semana, historial, todos' }, 400);
    }
  } catch (error) {
    console.error('Get professor classes error:', error);
    return jsonResponse({ error: 'Error al obtener clases' }, 500);
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
