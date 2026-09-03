import { Hono } from 'hono'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const uploads = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])

async function readBodyWithLimit(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

uploads.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const formData = await c.req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return c.json({ error: 'File is required' }, 400)
  }

  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'Only image uploads are supported' }, 400)
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File exceeds 5MB limit' }, 400)
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `${userId}_${crypto.randomUUID()}_${safeName}`

  await c.env.UPLOADS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  })

  return c.json({
    key,
    url: `/api/v1/uploads/${encodeURIComponent(key)}`,
  })
})

uploads.put('/:assetId', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const assetId = decodeURIComponent(c.req.param('assetId'))
  const contentHash = c.req.header('X-Content-Hash') ?? null

  if (!assetId.startsWith(`${userId}_`)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const existing = await c.env.UPLOADS.head(assetId)
  if (existing) {
    const existingHash = existing.customMetadata?.contentHash
    if (contentHash && existingHash && existingHash === contentHash) {
      return c.json({
        key: assetId,
        url: `/api/v1/uploads/${encodeURIComponent(assetId)}`,
        deduplicated: true,
      })
    }
    if (!contentHash) {
      return c.json({
        key: assetId,
        url: `/api/v1/uploads/${encodeURIComponent(assetId)}`,
        deduplicated: true,
      })
    }
  }

  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream'
  if (!ALLOWED_IMAGE_TYPES.has(contentType.split(';')[0]!.trim())) {
    return c.json({ error: 'Only image uploads are supported' }, 400)
  }

  const body = c.req.raw.body
  if (!body) {
    return c.json({ error: 'Body is required' }, 400)
  }

  const bytes = await readBodyWithLimit(body, MAX_UPLOAD_BYTES)
  if (!bytes) {
    return c.json({ error: 'File exceeds 5MB limit' }, 400)
  }

  await c.env.UPLOADS.put(assetId, bytes, {
    httpMetadata: { contentType },
    customMetadata: contentHash ? { contentHash } : undefined,
  })

  return c.json({
    key: assetId,
    url: `/api/v1/uploads/${encodeURIComponent(assetId)}`,
    deduplicated: false,
  })
})

uploads.get('/:key', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const key = decodeURIComponent(c.req.param('key'))

  if (!key.startsWith(`${userId}_`)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const object = await c.env.UPLOADS.get(key)
  if (!object) {
    return c.json({ error: 'File not found' }, 404)
  }

  const headers = new Headers()
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType)
  }
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  return new Response(object.body, { headers })
})

export default uploads
