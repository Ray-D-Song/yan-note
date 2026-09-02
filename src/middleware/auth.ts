import { createMiddleware } from 'hono/factory'
import { getTokenFromCookie, verifyToken } from '../lib/jwt'

export type AuthVariables = {
  userId: string
  userEmail: string
}

export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: AuthVariables
}>(async (c, next) => {
  const token = getTokenFromCookie(c.req.header('Cookie'))
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const secret = c.env.JWT_SECRET
  if (!secret) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const payload = await verifyToken(token, secret)
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', payload.sub)
  c.set('userEmail', payload.email)
  await next()
})

export const optionalAuthMiddleware = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: Partial<AuthVariables>
}>(async (c, next) => {
  const token = getTokenFromCookie(c.req.header('Cookie'))
  if (token && c.env.JWT_SECRET) {
    const payload = await verifyToken(token, c.env.JWT_SECRET)
    if (payload) {
      c.set('userId', payload.sub)
      c.set('userEmail', payload.email)
    }
  }
  await next()
})
