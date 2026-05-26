// api/estudiante/perfil.js - Student profile management
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

// GET - Get student profile
async function handleGet(request, env, user) {
  try {
    const url = new URL(request.url);
    const estudiante_id = url.searchParams.get('estudiante_id');
    let targetStudentId = estudiante_id;

    // If user is a student, find their own profile
    if (user.rol === 'estudiante') {
      const student = await env.DB.prepare(
        'SELECT id FROM students WHERE cedula_escolar = ? OR user_id = ?'
      )
        .bind(user.cedula, user.id)
        .first();
      if (student) {
        targetStudentId = student.id;
      } else {
        return jsonResponse({ error: 'Perfil de estudiante no encontrado' }, 404);
      }
    }

    // If user is representante, verify access
    if (user.rol === 'representante' && targetStudentId) {
      const relation = await env.DB.prepare(
        'SELECT id FROM parent_student WHERE representante_id = ? AND estudiante_id = ?'
      )
        .bind(user.id, targetStudentId)
        .first();
      if (!relation) {
        return jsonResponse({ error: 'No tiene acceso a este estudiante' }, 403);
      }
    }

    if (!targetStudentId) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    const student = await env.DB.prepare('SELECT * FROM students WHERE id = ? AND activo = 1')
      .bind(targetStudentId)
      .first();

    if (!student) {
      return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
    }

    // Get parent info for this student
    const { results: parents } = await env.DB.prepare(
      `SELECT u.id, u.cedula, u.nombre, u.apellido, u.email, u.telefono
       FROM parent_student ps
       INNER JOIN users u ON ps.representante_id = u.id
       WHERE ps.estudiante_id = ? AND u.activo = 1`
    )
      .bind(targetStudentId)
      .all();

    // Get attendance summary
    const summary = await env.DB.prepare(
      `SELECT
         COUNT(CASE WHEN ar.estado = 'presente' THEN 1 END) as total_presente,
         COUNT(CASE WHEN ar.estado = 'ausente' THEN 1 END) as total_ausente,
         COUNT(CASE WHEN ar.estado = 'tardanza' THEN 1 END) as total_tardanza,
         COUNT(CASE WHEN ar.estado = 'justificado' THEN 1 END) as total_justificado,
         COUNT(*) as total_registros
       FROM attendance_records ar
       WHERE ar.estudiante_id = ?`
    )
      .bind(targetStudentId)
      .first();

    return jsonResponse({
      perfil: student,
      representantes: parents,
      resumen_asistencia: summary,
    });
  } catch (error) {
    console.error('Get student profile error:', error);
    return jsonResponse({ error: 'Error al obtener perfil del estudiante' }, 500);
  }
}

// PUT - Update student profile
async function handlePut(request, env, user) {
  try {
    const body = await request.json();
    const { id, direccion, telefono_emergencia, contacto_emergencia, foto } = body;

    let targetStudentId = id;

    // If user is a student, they can only update their own profile
    if (user.rol === 'estudiante') {
      const student = await env.DB.prepare(
        'SELECT id FROM students WHERE cedula_escolar = ? OR user_id = ?'
      )
        .bind(user.cedula, user.id)
        .first();
      if (student) {
        targetStudentId = student.id;
      } else {
        return jsonResponse({ error: 'Perfil de estudiante no encontrado' }, 404);
      }
    }

    // Admin can update any student
    if (user.rol !== 'admin' && user.rol !== 'estudiante') {
      return jsonResponse({ error: 'Acceso denegado' }, 403);
    }

    if (!targetStudentId) {
      return jsonResponse({ error: 'ID de estudiante es requerido' }, 400);
    }

    const existing = await env.DB.prepare('SELECT * FROM students WHERE id = ? AND activo = 1')
      .bind(targetStudentId)
      .first();

    if (!existing) {
      return jsonResponse({ error: 'Estudiante no encontrado' }, 404);
    }

    let fotoKey = existing.foto;
    if (foto) {
      try {
        const base64Data = foto.split(',')[1] || foto;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fotoKey = `fotos/estudiantes/${existing.codigo_unico}-${Date.now()}.jpg`;
        await env.BUCKET.put(fotoKey, bytes, {
          httpMetadata: { contentType: 'image/jpeg' },
        });
        if (existing.foto) {
          await env.BUCKET.delete(existing.foto);
        }
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
      }
    }

    await env.DB.prepare(
      `UPDATE students SET direccion = ?, telefono_emergencia = ?, contacto_emergencia = ?, foto = ? WHERE id = ?`
    )
      .bind(
        direccion !== undefined ? direccion : existing.direccion,
        telefono_emergencia !== undefined ? telefono_emergencia : existing.telefono_emergencia,
        contacto_emergencia !== undefined ? contacto_emergencia : existing.contacto_emergencia,
        fotoKey,
        targetStudentId
      )
      .run();

    const updatedStudent = await env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(targetStudentId)
      .first();

    return jsonResponse({ perfil: updatedStudent, message: 'Perfil actualizado exitosamente' });
  } catch (error) {
    console.error('Update student profile error:', error);
    return jsonResponse({ error: 'Error al actualizar perfil del estudiante' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'GET':
      return handleGet(request, env, user);
    case 'PUT':
      return handlePut(request, env, user);
    default:
      return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
