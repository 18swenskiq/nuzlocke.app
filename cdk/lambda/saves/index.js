const {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3')

const s3 = new S3Client({})
const bucketName = process.env.SAVES_BUCKET_NAME
const saveIdPattern = /^[a-zA-Z0-9._-]{1,128}$/

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method
    const rawPath = event.rawPath || ''
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub

    if (!userId) {
      return response(401, { message: 'Missing authenticated user' })
    }

    if (method === 'GET' && rawPath === '/api/saves') {
      return response(200, { saves: await listSaves(userId) })
    }

    const saveId = event.pathParameters?.saveId
    if (!isValidSaveId(saveId)) {
      return response(400, { message: 'Invalid save ID' })
    }

    if (method === 'GET') {
      return response(200, await getSave(userId, saveId))
    }

    if (method === 'PUT') {
      const body = parseBody(event)
      validateSaveBody(saveId, body)
      await putSave(userId, saveId, body)
      return response(200, { ok: true })
    }

    if (method === 'DELETE') {
      await deleteSave(userId, saveId)
      return response(200, { ok: true })
    }

    return response(405, { message: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    return response(err.statusCode || 500, {
      message: err.expose ? err.message : 'Unable to process save request',
    })
  }
}

async function listSaves(userId) {
  const prefix = userPrefix(userId)
  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    }),
  )

  const objects = (listed.Contents || []).filter((item) =>
    item.Key?.endsWith('.nzsav'),
  )

  return Promise.all(
    objects.map(async (item) => {
      const { __meta, ...data } = await readObject(item.Key)
      return {
        save: __meta,
        data,
        key: item.Key,
        cloudUpdated: item.LastModified?.toISOString(),
      }
    }),
  )
}

async function getSave(userId, saveId) {
  return readObject(saveKey(userId, saveId))
}

async function putSave(userId, saveId, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: saveKey(userId, saveId),
      Body: JSON.stringify(body),
      ContentType: 'application/json; charset=utf-8',
      ServerSideEncryption: 'AES256',
    }),
  )
}

async function deleteSave(userId, saveId) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: saveKey(userId, saveId),
    }),
  )
}

async function readObject(key) {
  const object = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  )

  return JSON.parse(await object.Body.transformToString())
}

function parseBody(event) {
  if (!event.body) {
    throw clientError('Missing save body')
  }

  const payload = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  try {
    return JSON.parse(payload)
  } catch (_) {
    throw clientError('Save body must be valid JSON')
  }
}

function validateSaveBody(saveId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw clientError('Save body must be a JSON object')
  }

  if (!body.__meta || body.__meta.id !== saveId) {
    throw clientError('Save metadata must match the requested save ID')
  }
}

function isValidSaveId(saveId) {
  return typeof saveId === 'string' && saveIdPattern.test(saveId)
}

function saveKey(userId, saveId) {
  return `${userPrefix(userId)}${saveId}.nzsav`
}

function userPrefix(userId) {
  return `users/${encodeURIComponent(userId)}/saves/`
}

function clientError(message) {
  const err = new Error(message)
  err.statusCode = 400
  err.expose = true
  return err
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}
