// api/upload.js - Upload and retrieve photos from R2
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

// POST - Upload photo to R2 bucket
async function handlePost(request, env, user) {
  try {
    const contentType = request.headers.get('Content-Type') || '';

    let fileData;
    let fileName;
    let fileContentType;

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return jsonResponse({ error: 'No se encontró archivo en la petición' }, 400);
      }

      fileData = await file.arrayBuffer();
      fileName = file.name;
      fileContentType = file.type || 'image/jpeg';
    } else if (contentType.includes('application/json')) {
      // Handle JSON with base64 encoded image
      const body = await request.json();
      const { file, filename, mimetype } = body;

      if (!file) {
        return jsonResponse({ error: 'No se encontró archivo en la petición' }, 400);
      }

      const base64Data = file.split(',')[1] || file;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      fileData = bytes.buffer;
      fileName = filename || 'upload.jpg';
      fileContentType = mimetype || 'image/jpeg';
    } else {
      return jsonResponse({ error: 'Content-Type no soportado. Use multipart/form-data o application/json' }, 400);
    }

    // Generate unique key for R2
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split('.').pop() || 'jpg';
    const key = `uploads/${timestamp}-${randomSuffix}.${extension}`;

    // Upload to R2
    await env.BUCKET.put(key, fileData, {
      httpMetadata: {
        contentType: fileContentType,
      },
      customMetadata: {
        originalName: fileName,
        uploadedBy: String(user.id),
        uploadedAt: new Date().toISOString(),
      },
    });

    return jsonResponse({
      key,
      url: `/api/upload?key=${encodeURIComponent(key)}`,
      message: 'Archivo subido exitosamente',
    }, 201);
  } catch (error) {
    console.error('Upload error:', error);
    return jsonResponse({ error: 'Error al subir archivo' }, 500);
  }
}

// GET - Get photo from R2 by key
async function handleGet(request, env, user) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return jsonResponse({ error: 'Parámetro key es requerido' }, 400);
    }

    const object = await env.BUCKET.get(key);

    if (!object) {
      return jsonResponse({ error: 'Archivo no encontrado' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Get file error:', error);
    return jsonResponse({ error: 'Error al obtener archivo' }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const user = context.data?.user;
  const method = request.method;

  switch (method) {
    case 'POST':
      return handlePost(request, env, user);
    case 'GET':
      return handleGet(request, env, user);
    default:
      return jsonResponse({ error: 'Método no permitido' }, 405);
  }
}
