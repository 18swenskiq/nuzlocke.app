const {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3')

const s3 = new S3Client({})
const bucketName = process.env.RANDOMIZER_BUCKET_NAME
const runIdPattern = /^[a-zA-Z0-9._-]{1,128}$/

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method
    const rawPath = event.rawPath || ''
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub

    if (!userId) {
      return response(401, { message: 'Missing authenticated user' })
    }

    if (method === 'GET' && rawPath === '/api/randomizer/runs') {
      return response(200, { runs: await listRuns(userId) })
    }

    const runId = event.pathParameters?.runId
    if (!isValidRunId(runId)) {
      return response(400, { message: 'Invalid randomizer run ID' })
    }

    if (method === 'GET') {
      return response(200, await getRun(userId, runId))
    }

    if (method === 'PUT') {
      const body = parseBody(event)
      validateRunBody(runId, body)
      await putRun(userId, runId, body)
      return response(200, { ok: true })
    }

    if (method === 'DELETE') {
      await deleteRun(userId, runId)
      return response(200, { ok: true })
    }

    return response(405, { message: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    return response(err.statusCode || 500, {
      message: err.expose ? err.message : 'Unable to process randomizer request',
    })
  }
}

async function listRuns(userId) {
  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: userPrefix(userId),
    }),
  )

  const objects = (listed.Contents || []).filter((item) =>
    item.Key?.endsWith('.json'),
  )

  return Promise.all(
    objects.map(async (item) => ({
      run: await readObject(item.Key),
      key: item.Key,
      cloudUpdated: item.LastModified?.toISOString(),
    })),
  )
}

async function getRun(userId, runId) {
  return readObject(runKey(userId, runId))
}

async function putRun(userId, runId, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: runKey(userId, runId),
      Body: JSON.stringify(body),
      ContentType: 'application/json; charset=utf-8',
      ServerSideEncryption: 'AES256',
    }),
  )
}

async function deleteRun(userId, runId) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: runKey(userId, runId),
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
    throw clientError('Missing randomizer run body')
  }

  const payload = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  try {
    return JSON.parse(payload)
  } catch (_) {
    throw clientError('Randomizer run body must be valid JSON')
  }
}

function validateRunBody(runId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw clientError('Randomizer run body must be a JSON object')
  }

  if (body.runId !== runId && body.__meta?.runId !== runId) {
    throw clientError('Randomizer run metadata must match the requested run ID')
  }
}

function isValidRunId(runId) {
  return typeof runId === 'string' && runIdPattern.test(runId)
}

function runKey(userId, runId) {
  return `${userPrefix(userId)}${runId}.json`
}

function userPrefix(userId) {
  return `users/${encodeURIComponent(userId)}/randomizer/runs/`
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

