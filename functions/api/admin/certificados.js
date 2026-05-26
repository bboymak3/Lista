// api/admin/certificados.js - Certificate management with PDF generation
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

function checkAdmin(user) {
  return user && user.rol === 'admin';
}

// GET - List certificates
async function handleGet(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  const url = new URL(request.url);
  const estado = url.searchParams.get('estado') || null;
  const estudiante_id = url.searchParams.get('estudiante_id') || null;
  const tipo = url.searchParams.get('tipo') || null;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM certificates WHERE 1=1';
    let listQuery = `SELECT c.*, 
      s.nombre as estudiante_nombre, s.apellido as estudiante_apellido, s.cedula_escolar, s.grado, s.seccion, s.codigo_unico,
      u.nombre as solicitado_nombre, u.apellido as solicitado_apellido,
      a.nombre as aprobado_nombre, a.apellido as aprobado_apellido
     FROM certificates c
     LEFT JOIN students s ON c.estudiante_id = s.id
     LEFT JOIN users u ON c.solicitado_por = u.id
     LEFT JOIN users a ON c.aprobado_por = a.id
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

    return jsonResponse({
      certificados: results,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('List certificates error:', error);
    return jsonResponse({ error: 'Error al listar certificados' }, 500);
  }
}

// POST - Approve or reject certificate with PDF generation
async function handlePost(request, env, user) {
  if (!checkAdmin(user)) {
    return jsonResponse({ error: 'Acceso denegado. Se requiere rol admin.' }, 403);
  }

  try {
    const body = await request.json();
    const { id, action, motivo_rechazo, observaciones, referencias } = body;

    if (!id || !action) {
      return jsonResponse({ error: 'ID y acción son requeridos' }, 400);
    }

    const cert = await env.DB.prepare(
      `SELECT c.*, s.nombre as estudiante_nombre, s.apellido as estudiante_apellido, 
              s.cedula_escolar, s.grado, s.seccion, s.codigo_unico, s.fecha_nacimiento,
              sc.nombre as school_name, sc.direccion as school_direccion
       FROM certificates c
       LEFT JOIN students s ON c.estudiante_id = s.id
       LEFT JOIN school_config sc ON 1=1
       WHERE c.id = ?`
    ).bind(id).first();

    if (!cert) {
      return jsonResponse({ error: 'Certificado no encontrado' }, 404);
    }

    if (cert.estado !== 'pendiente') {
      return jsonResponse({ error: 'El certificado ya fue procesado' }, 400);
    }

    let pdfKey = null;

    if (action === 'aprobar') {
      // Generate PDF content as HTML and store in R2
      const tipoLabels = {
        estudio: 'Constancia de Estudio',
        trabajo: 'Constancia de Trabajo',
        buena_conducta: 'Buena Conducta',
        retiro: 'Retiro'
      };

      const today = new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });
      const fechaNac = cert.fecha_nacimiento ? new Date(cert.fecha_nacimiento).toLocaleDateString('es-VE') : 'N/A';

      const pdfHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;color:#333}
.header{text-align:center;border-bottom:3px double #1a365d;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#1a365d;margin:0;font-size:18px}
.header h2{color:#2c5282;margin:5px 0;font-size:14px}
.title{text-align:center;font-size:20px;font-weight:bold;color:#1a365d;margin:30px 0;text-transform:uppercase}
.content{margin:20px 0;font-size:14px;text-align:justify}
.content p{text-indent:40px}
.student-info{margin:20px 0;padding:15px;background:#f7fafc;border-left:4px solid #2c5282;border-radius:4px}
.student-info p{margin:4px 0;text-indent:0}
.references{margin:20px 0;padding:15px;background:#fffbeb;border-left:4px solid #d69e2e;border-radius:4px}
.references h3{margin:0 0 10px;color:#92400e;font-size:14px}
.references p{margin:4px 0;text-indent:0;font-size:13px}
.footer{margin-top:50px;display:flex;justify-content:space-between}
.sign{width:200px;text-align:center}
.sign .line{border-top:1px solid #333;margin-top:50px;padding-top:5px;font-size:12px}
.stamp{text-align:center;margin-top:30px;font-size:11px;color:#718096}
</style></head><body>
<div class="header">
  <h1>${cert.school_name || 'UNIDAD EDUCATIVA'}</h1>
  <h2>${cert.school_direccion || ''}</h2>
</div>
<div class="title">${tipoLabels[cert.tipo] || 'Constancia'}</h2></div>
<div class="content">
  <p>Quien suscribe, Director(a) de la ${cert.school_name || 'institución'}, hace constar por medio de la presente que el(la) ciudadano(a):</p>
</div>
<div class="student-info">
  <p><strong>Nombre y Apellido:</strong> ${cert.estudiante_nombre || ''} ${cert.estudiante_apellido || ''}</p>
  <p><strong>Cédula Escolar:</strong> ${cert.cedula_escolar || 'N/A'}</p>
  <p><strong>Fecha de Nacimiento:</strong> ${fechaNac}</p>
  <p><strong>Grado:</strong> ${cert.grado || 'N/A'}° &nbsp;&nbsp; <strong>Sección:</strong> "${cert.seccion || 'N/A'}"</p>
  <p><strong>Código:</strong> ${cert.codigo_unico || 'N/A'}</p>
</div>
<div class="content">
  <p>Es alumno(a) regular de esta institución durante el período escolar vigente, demostrando conducta y cumplimiento en sus actividades académicas.</p>
  ${cert.tipo === 'buena_conducta' ? '<p>Se certifica que el(la) mencionado(a) ha observado buena conducta y comportamiento durante su permanencia en esta institución.</p>' : ''}
  ${cert.tipo === 'trabajo' ? '<p>Se certifica que el(la) estudiante se encuentra apto(a) para realizar actividades laborales y prácticas profesionales.</p>' : ''}
  ${cert.tipo === 'retiro' ? '<p>Se certifica que el(la) estudiante se ha retirado de esta institución por motivos personales/académicos.</p>' : ''}
  <p>Se expide la presente constancia a solicitud de la parte interesada en fecha ${today}.</p>
</div>
${referencias ? `<div class="references"><h3>Referencias</h3><p>${referencias}</p></div>` : ''}
${observaciones ? `<div class="references" style="background:#f0fff4;border-left-color:#38a169"><h3 style="color:#276749">Observaciones</h3><p>${observaciones}</p></div>` : ''}
<div class="footer">
  <div class="sign"><div class="line">Director(a)</div></div>
  <div class="sign"><div class="line">Secretario(a)</div></div>
</div>
<div class="stamp">Este documento es válido con sello húmedo y firma autógrafa</div>
</body></html>`;

      // Store HTML as PDF-like document in R2
      if (env.BUCKET) {
        try {
          const pdfKeyVal = `certificados/constancia-${cert.id}-${Date.now()}.html`;
          await env.BUCKET.put(pdfKeyVal, pdfHtml, {
            httpMetadata: { contentType: 'text/html' },
          });
          pdfKey = pdfKeyVal;
        } catch (e) {
          console.error('PDF upload error:', e);
        }
      }

      await env.DB.prepare(
        `UPDATE certificates SET estado = 'aprobada', aprobado_por = ?, motivo_rechazo = NULL, 
         referencias = ?, observaciones = ?, pdf_key = ?, fecha_aprobacion = datetime('now') WHERE id = ?`
      ).bind(user.id, referencias || cert.referencias, observaciones || cert.observaciones, pdfKey, id).run();

      // Notify representative
      try {
        const { results: parents } = await env.DB.prepare(
          `SELECT u.id FROM parent_student ps INNER JOIN users u ON ps.representante_id = u.id WHERE ps.estudiante_id = ? AND u.activo = 1`
        ).bind(cert.estudiante_id).all();

        for (const parent of parents) {
          await env.DB.prepare(
            `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, 'nota', ?, ?, 0, datetime('now'))`
          ).bind(parent.id, cert.estudiante_id,
            `Constancia aprobada - ${cert.estudiante_nombre} ${cert.estudiante_apellido}`,
            `La constancia de ${cert.tipo} solicitada para ${cert.estudiante_nombre} ${cert.estudiante_apellido} ha sido aprobada.`
          ).run();
        }
      } catch (e) { /* ignore notification errors */ }

      return jsonResponse({ message: 'Certificado aprobado exitosamente', pdf_key: pdfKey });

    } else if (action === 'rechazar') {
      if (!motivo_rechazo) {
        return jsonResponse({ error: 'El motivo de rechazo es requerido' }, 400);
      }

      await env.DB.prepare(
        `UPDATE certificates SET estado = 'rechazada', aprobado_por = ?, motivo_rechazo = ?, observaciones = ?, fecha_aprobacion = datetime('now') WHERE id = ?`
      ).bind(user.id, motivo_rechazo, observaciones || null, id).run();

      // Notify representative
      try {
        const { results: parents } = await env.DB.prepare(
          `SELECT u.id FROM parent_student ps INNER JOIN users u ON ps.representante_id = u.id WHERE ps.estudiante_id = ? AND u.activo = 1`
        ).bind(cert.estudiante_id).all();

        for (const parent of parents) {
          await env.DB.prepare(
            `INSERT INTO notifications (representante_id, estudiante_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, 'general', ?, ?, 0, datetime('now'))`
          ).bind(parent.id, cert.estudiante_id,
            `Constancia rechazada - ${cert.estudiante_nombre} ${cert.estudiante_apellido}`,
            `La constancia de ${cert.tipo} solicitada para ${cert.estudiante_nombre} ${cert.estudiante_apellido} ha sido rechazada. Motivo: ${motivo_rechazo}`
          ).run();
        }
      } catch (e) { /* ignore */ }

      return jsonResponse({ message: 'Certificado rechazado' });

    } else {
      return jsonResponse({ error: 'Acción no válida. Use: aprobar o rechazar' }, 400);
    }
  } catch (error) {
    console.error('Process certificate error:', error);
    return jsonResponse({ error: 'Error al procesar certificado' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET': return handleGet(request, env, user);
    case 'POST': return handlePost(request, env, user);
    default: return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
