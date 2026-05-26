// api/admin/estadisticas.js - School statistics and reports
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

function checkAdmin(user) {
  return user && user.rol === 'admin';
}

// GET ?action=resumen - Overall summary stats
async function handleResumen(env) {
  const [
    estudiantes,
    profesores,
    representantes,
    asistenciasHoy,
    inasistenciasHoy,
    tardanzasHoy,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as total FROM students WHERE activo = 1').first(),
    env.DB.prepare("SELECT COUNT(*) as total FROM users WHERE rol = 'profesor' AND activo = 1").first(),
    env.DB.prepare("SELECT COUNT(*) as total FROM users WHERE rol = 'representante' AND activo = 1").first(),
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM attendance_records ar
       INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
       WHERE DATE(ats.fecha) = DATE("now") AND ar.estado = 'presente'`
    ).first(),
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM attendance_records ar
       INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
       WHERE DATE(ats.fecha) = DATE("now") AND ar.estado = 'ausente'`
    ).first(),
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM attendance_records ar
       INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
       WHERE DATE(ats.fecha) = DATE("now") AND ar.estado = 'tardanza'`
    ).first(),
  ]);

  // Get active sessions today
  const sesionesHoy = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM attendance_sessions WHERE DATE(fecha) = DATE("now")`
  ).first();

  // Pending certificates
  const certPendientes = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM certificates WHERE estado = 'pendiente'"
  ).first();

  return json({
    resumen: {
      total_estudiantes: estudiantes.total,
      total_profesores: profesores.total,
      total_representantes: representantes.total,
      asistencias_hoy: asistenciasHoy.total,
      inasistencias_hoy: inasistenciasHoy.total,
      tardanzas_hoy: tardanzasHoy.total,
      sesiones_hoy: sesionesHoy.total,
      certificados_pendientes: certPendientes.total,
    },
  });
}

// GET ?action=asistencia - Attendance stats with filters
async function handleAsistencia(request, env) {
  const url = new URL(request.url);
  const fecha_desde = url.searchParams.get('fecha_desde') || null;
  const fecha_hasta = url.searchParams.get('fecha_hasta') || null;
  const seccion = url.searchParams.get('seccion') || null;
  const persona_id = url.searchParams.get('persona_id') || null;
  const periodo = url.searchParams.get('periodo') || 'dia';

  // Build date range based on period if no explicit dates
  let fechaDesde = fecha_desde;
  let fechaHasta = fecha_hasta;

  if (!fecha_desde && !fecha_hasta) {
    const now = new Date();
    switch (periodo) {
      case 'semana': {
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diff);
        fechaDesde = monday.toISOString().split('T')[0];
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        fechaHasta = sunday.toISOString().split('T')[0];
        break;
      }
      case 'quincena': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const midDay = new Date(now.getFullYear(), now.getMonth(), 15);
        if (now <= midDay) {
          fechaDesde = firstDay.toISOString().split('T')[0];
          fechaHasta = midDay.toISOString().split('T')[0];
        } else {
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          fechaDesde = new Date(now.getFullYear(), now.getMonth(), 16).toISOString().split('T')[0];
          fechaHasta = lastDay.toISOString().split('T')[0];
        }
        break;
      }
      case 'mes': {
        fechaDesde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        fechaHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        break;
      }
      case 'ano': {
        fechaDesde = `${now.getFullYear()}-01-01`;
        fechaHasta = `${now.getFullYear()}-12-31`;
        break;
      }
      default: // dia
        fechaDesde = now.toISOString().split('T')[0];
        fechaHasta = now.toISOString().split('T')[0];
    }
  }

  let query = `SELECT ar.estado, COUNT(*) as total
               FROM attendance_records ar
               INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
               WHERE 1=1`;
  const params = [];

  if (fechaDesde) {
    query += ' AND DATE(ats.fecha) >= ?';
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    query += ' AND DATE(ats.fecha) <= ?';
    params.push(fechaHasta);
  }
  if (seccion) {
    query += ` AND ar.estudiante_id IN (SELECT id FROM students WHERE seccion = ? AND activo = 1)`;
    params.push(seccion);
  }
  if (persona_id) {
    query += ' AND ar.estudiante_id = ?';
    params.push(persona_id);
  }

  query += ' GROUP BY ar.estado';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Build summary
  const resumen = {
    presentes: 0,
    ausentes: 0,
    tardanzas: 0,
    justificados: 0,
    total: 0,
  };

  for (const row of results) {
    switch (row.estado) {
      case 'presente': resumen.presentes = row.total; break;
      case 'ausente': resumen.ausentes = row.total; break;
      case 'tardanza': resumen.tardanzas = row.total; break;
      case 'justificado': resumen.justificados = row.total; break;
    }
    resumen.total += row.total;
  }

  if (resumen.total > 0) {
    resumen.porcentaje_asistencia = Math.round((resumen.presentes / resumen.total) * 10000) / 100;
  } else {
    resumen.porcentaje_asistencia = 0;
  }

  // Daily breakdown if period is longer than a day
  let detalle_diario = null;
  if (fechaDesde !== fechaHasta) {
    let detailQuery = `SELECT DATE(ats.fecha) as fecha, ar.estado, COUNT(*) as total
                       FROM attendance_records ar
                       INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
                       WHERE 1=1`;
    const detailParams = [...params];

    if (fechaDesde) {
      detailQuery += ' AND DATE(ats.fecha) >= ?';
      if (!params.includes(fechaDesde)) detailParams.push(fechaDesde);
    }
    if (fechaHasta) {
      detailQuery += ' AND DATE(ats.fecha) <= ?';
      if (!params.includes(fechaHasta)) detailParams.push(fechaHasta);
    }

    detailQuery += ' GROUP BY DATE(ats.fecha), ar.estado ORDER BY DATE(ats.fecha) ASC';

    // Rebuild params for detail query
    const dp = [];
    if (fechaDesde) dp.push(fechaDesde);
    if (fechaHasta && fechaHasta !== fechaDesde) dp.push(fechaHasta);
    if (seccion) dp.push(seccion);
    if (persona_id) dp.push(persona_id);

    // Simplify: use same base filters
    let dq2 = `SELECT DATE(ats.fecha) as fecha, ar.estado, COUNT(*) as total
               FROM attendance_records ar
               INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
               WHERE DATE(ats.fecha) >= ? AND DATE(ats.fecha) <= ?`;
    const dp2 = [fechaDesde, fechaHasta];
    if (seccion) {
      dq2 += ` AND ar.estudiante_id IN (SELECT id FROM students WHERE seccion = ? AND activo = 1)`;
      dp2.push(seccion);
    }
    if (persona_id) {
      dq2 += ' AND ar.estudiante_id = ?';
      dp2.push(persona_id);
    }
    dq2 += ' GROUP BY DATE(ats.fecha), ar.estado ORDER BY DATE(ats.fecha) ASC';

    const { results: detailResults } = await env.DB.prepare(dq2).bind(...dp2).all();
    detalle_diario = detailResults;
  }

  return json({
    asistencia: {
      periodo,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      resumen,
      detalle_diario,
    },
  });
}

// GET ?action=profesores - Teacher stats
async function handleProfesores(env) {
  const { results: profesores } = await env.DB.prepare(
    `SELECT u.id, u.nombre, u.apellido, u.email, u.telefono,
            COUNT(DISTINCT ats.id) as total_sesiones,
            COUNT(ar.id) as total_registros,
            COUNT(CASE WHEN ar.estado = 'presente' THEN 1 END) as total_presentes,
            COUNT(CASE WHEN ar.estado = 'ausente' THEN 1 END) as total_ausentes,
            COUNT(CASE WHEN ar.estado = 'tardanza' THEN 1 END) as total_tardanzas
     FROM users u
     LEFT JOIN attendance_sessions ats ON ats.profesor_id = u.id
     LEFT JOIN attendance_records ar ON ar.sesion_id = ats.id
     WHERE u.rol = 'profesor' AND u.activo = 1
     GROUP BY u.id
     ORDER BY u.apellido, u.nombre`
  ).all();

  // Calculate attendance rate per teacher
  const profesoresStats = profesores.map((p) => ({
    ...p,
    porcentaje_asistencia: p.total_registros > 0
      ? Math.round((p.total_presentes / p.total_registros) * 10000) / 100
      : 0,
  }));

  return json({ profesores: profesoresStats });
}

// GET ?action=inasistencias - Absence report
async function handleInasistencias(request, env) {
  const url = new URL(request.url);
  const fecha_desde = url.searchParams.get('fecha_desde') || null;
  const fecha_hasta = url.searchParams.get('fecha_hasta') || null;
  const seccion = url.searchParams.get('seccion') || null;
  const persona_id = url.searchParams.get('persona_id') || null;

  let query = `SELECT s.id as estudiante_id, s.nombre, s.apellido, s.codigo_unico, s.grado, s.seccion,
               COUNT(CASE WHEN ar.estado = 'ausente' THEN 1 END) as total_ausencias,
               COUNT(CASE WHEN ar.estado = 'tardanza' THEN 1 END) as total_tardanzas,
               COUNT(CASE WHEN ar.estado = 'justificado' THEN 1 END) as total_justificados,
               COUNT(ar.id) as total_registros
               FROM students s
               INNER JOIN attendance_records ar ON ar.estudiante_id = s.id
               INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
               WHERE s.activo = 1 AND (ar.estado = 'ausente' OR ar.estado = 'tardanza' OR ar.estado = 'justificado')`;
  const params = [];

  if (fecha_desde) {
    query += ' AND DATE(ats.fecha) >= ?';
    params.push(fecha_desde);
  }
  if (fecha_hasta) {
    query += ' AND DATE(ats.fecha) <= ?';
    params.push(fecha_hasta);
  }
  if (seccion) {
    query += ' AND s.seccion = ?';
    params.push(seccion);
  }
  if (persona_id) {
    query += ' AND s.id = ?';
    params.push(persona_id);
  }

  query += ' GROUP BY s.id ORDER BY total_ausencias DESC, s.apellido, s.nombre';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  return json({
    inasistencias: results,
    filtros: { fecha_desde, fecha_hasta, seccion, persona_id },
  });
}

// GET ?action=usuarios_dia - Users active today by role
async function handleUsuariosDia(env) {
  const today = new Date().toISOString().split('T')[0];

  // Teachers who logged in today
  const { results: profesoresHoy } = await env.DB.prepare(
    `SELECT u.id, u.nombre, u.apellido, tdl.hora_entrada, tdl.hora_salida
     FROM users u
     LEFT JOIN teacher_daily_log tdl ON tdl.profesor_id = u.id AND DATE(tdl.fecha) = ?
     WHERE u.rol = 'profesor' AND u.activo = 1
     ORDER BY u.apellido, u.nombre`
  ).bind(today).all();

  // Active attendance sessions today
  const { results: sesionesHoy } = await env.DB.prepare(
    `SELECT ats.*, u.nombre as profesor_nombre, u.apellido as profesor_apellido, sub.nombre as materia_nombre
     FROM attendance_sessions ats
     INNER JOIN users u ON ats.profesor_id = u.id
     INNER JOIN schedules sc ON ats.horario_id = sc.id
     INNER JOIN subjects sub ON sc.materia_id = sub.id
     WHERE DATE(ats.fecha) = ?
     ORDER BY ats.hora_inicio ASC`
  ).bind(today).all();

  // Students with attendance records today
  const estudiantesHoy = await env.DB.prepare(
    `SELECT COUNT(DISTINCT ar.estudiante_id) as total
     FROM attendance_records ar
     INNER JOIN attendance_sessions ats ON ar.sesion_id = ats.id
     WHERE DATE(ats.fecha) = ?`
  ).bind(today).first();

  // Representatives who received notifications today
  const representantesHoy = await env.DB.prepare(
    `SELECT COUNT(DISTINCT representante_id) as total
     FROM notifications
     WHERE DATE(fecha_creacion) = ?`
  ).bind(today).first();

  return json({
    usuarios_dia: {
      fecha: today,
      profesores: profesoresHoy,
      sesiones: sesionesHoy,
      estudiantes_con_asistencia: estudiantesHoy.total,
      representantes_notificados: representantesHoy.total,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;

  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  if (request.method !== 'GET') {
    return json({ error: 'Método no permitido' }, 405);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'resumen';

    switch (action) {
      case 'resumen':
        return await handleResumen(env);
      case 'asistencia':
        return await handleAsistencia(request, env);
      case 'profesores':
        return await handleProfesores(env);
      case 'inasistencias':
        return await handleInasistencias(request, env);
      case 'usuarios_dia':
        return await handleUsuariosDia(env);
      default:
        return json({ error: 'Acción no válida. Opciones: resumen, asistencia, profesores, inasistencias, usuarios_dia' }, 400);
    }
  } catch (error) {
    console.error('Statistics error:', error);
    return json({ error: 'Error al obtener estadísticas' }, 500);
  }
}
