import { createMiddleware } from 'hono/factory'
import { getSession, getSessionFromCookie } from '../lib/session'

export type AuthVariables = {
  userId: string
  userEmail: string
}

export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: AuthVariables
}>(async (c, next) => {
  const token = getSessionFromCookie(c.req.header('Cookie'))
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const session = await getSession(c.env.DB, token)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('userId', session.userId)
  c.set('userEmail', session.email)
  await next()
})
