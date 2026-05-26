// api/admin/certificados.js - Certificate management
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

// GET - List certificates with filters / statistics
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // Statistics endpoint
    if (action === 'estadisticas') {
      const stats = await env.DB.prepare(
        `SELECT
          COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes,
          COUNT(CASE WHEN estado = 'aprobada' THEN 1 END) as aprobadas,
          COUNT(CASE WHEN estado = 'rechazada' THEN 1 END) as rechazadas,
          COUNT(*) as total
        FROM certificates`
      ).first();

      return json({ estadisticas: stats });
    }

    // List certificates with filters and pagination
    const estado = url.searchParams.get('estado') || null;
    const estudiante_id = url.searchParams.get('estudiante_id') || null;
    const tipo = url.searchParams.get('tipo') || null;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM certificates WHERE 1=1';
    let listQuery = `SELECT c.*, s.nombre as estudiante_nombre, s.apellido as estudiante_apellido,
                     s.codigo_unico, u.nombre as solicitado_nombre, u.apellido as solicitado_apellido
                     FROM certificates c
                     INNER JOIN students s ON c.estudiante_id = s.id
                     INNER JOIN users u ON c.solicitado_por = u.id
                     WHERE 1=1`;
    const params = [];

    if (estado) {
      countQuery += ' AND c.estado = ?';
      listQuery += ' AND c.estado = ?';
      params.push(estado);
    }
    if (estudiante_id) {
      countQuery += ' AND c.estudiante_id = ?';
      listQuery += ' AND c.estudiante_id = ?';
      params.push(estudiante_id);
    }
    if (tipo) {
      countQuery += ' AND c.tipo = ?';
      listQuery += ' AND c.tipo = ?';
      params.push(tipo);
    }

    listQuery += ' ORDER BY c.fecha_solicitud DESC LIMIT ? OFFSET ?';

    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countResult.total;

    const { results } = await env.DB.prepare(listQuery).bind(...params, limit, offset).all();

    return json({
      certificados: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List certificates error:', error);
    return json({ error: 'Error al listar certificados' }, 500);
  }
}

// POST - Approve or reject certificate
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return json({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, estado, motivo_rechazo, referencias, observaciones } = body;

    if (!id || !estado) {
      return json({ error: 'ID y estado son requeridos' }, 400);
    }

    if (!['aprobada', 'rechazada'].includes(estado)) {
      return json({ error: 'Estado debe ser "aprobada" o "rechazada"' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM certificates WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'Certificado no encontrado' }, 404);
    }

    if (existing.estado !== 'pendiente') {
      return json({ error: 'Solo se pueden procesar certificados pendientes' }, 400);
    }

    if (estado === 'rechazada' && !motivo_rechazo) {
      return json({ error: 'Debe indicar el motivo del rechazo' }, 400);
    }

    const fechaAprobacion = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE certificates SET estado = ?, aprobado_por = ?, motivo_rechazo = ?, referencias = ?, observaciones = ?, fecha_aprobacion = ? WHERE id = ?`
    )
      .bind(
        estado,
        user.id,
        motivo_rechazo || null,
        referencias || null,
        observaciones || null,
        fechaAprobacion,
        id
      )
      .run();

    // Notify student's representatives about the certificate status change
    try {
      const { results: parents } = await env.DB.prepare(
        `SELECT u.id FROM parent_student ps INNER JOIN users u ON ps.representante_id = u.id WHERE ps.estudiante_id = ? AND u.activo = 1`
      )
        .bind(existing.estudiante_id)
        .all();

      const student = await env.DB.prepare('SELECT nombre, apellido FROM students WHERE id = ?').bind(existing.estudiante_id).first();
      const titulo = estado === 'aprobada'
        ? `Constancia aprobada de ${student.nombre} ${student.apellido}`
        : `Constancia rechazada de ${student.nombre} ${student.apellido}`;
      const mensaje = estado === 'aprobada'
        ? `La constancia de tipo "${existing.tipo}" solicitada para ${student.nombre} ${student.apellido} ha sido aprobada.`
        : `La constancia de tipo "${existing.tipo}" solicitada para ${student.nombre} ${student.apellido} ha sido rechazada. Motivo: ${motivo_rechazo}`;

      for (const parent of parents) {
        await env.DB.prepare(
          `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, 'constancia', ?, ?, 0, datetime("now"))`
        )
          .bind(parent.id, existing.estudiante_id, titulo, mensaje)
          .run();
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    const updated = await env.DB.prepare('SELECT * FROM certificates WHERE id = ?').bind(id).first();
    return json({ certificado: updated, message: `Certificado ${estado === 'aprobada' ? 'aprobado' : 'rechazado'} exitosamente` });
  } catch (error) {
    console.error('Approve/reject certificate error:', error);
    return json({ error: 'Error al procesar certificado' }, 500);
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
    default:
      return json({ error: 'Método no permitido' }, 405);
  }
}
