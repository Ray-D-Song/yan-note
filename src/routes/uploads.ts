import { Hono } from 'hono'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const uploads = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

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

uploads.get('/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
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
