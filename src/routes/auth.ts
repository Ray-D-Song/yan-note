import { Hono } from 'hono'
import { createUser, findUserByEmail, findUserById } from '../lib/db'
import { hashPassword, verifyPassword } from '../lib/password'
import {
  clearAuthCookie,
  createSession,
  deleteSession,
  getSessionFromCookie,
  setAuthCookie,
} from '../lib/session'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const auth = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function issueSession(
  c: {
    env: CloudflareBindings
    header: (name: string, value: string) => void
  },
  userId: string,
) {
  const token = await createSession(c.env.DB, userId)
  setAuthCookie(c, token)
}

auth.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const email = body.email?.trim()
  const password = body.password

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }
  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400)
  }

  const existing = await findUserByEmail(c.env.DB, email)
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  await createUser(c.env.DB, userId, email, passwordHash)
  await issueSession(c, userId)

  return c.json({ id: userId, email: email.toLowerCase() }, 201)
})

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const email = body.email?.trim()
  const password = body.password

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const user = await findUserByEmail(c.env.DB, email)
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  await issueSession(c, user.id)
  return c.json({ id: user.id, email: user.email })
})

auth.post('/logout', async (c) => {
  const token = getSessionFromCookie(c.req.header('Cookie'))
  if (token) {
    await deleteSession(c.env.DB, token)
  }
  clearAuthCookie(c)
  return c.json({ ok: true })
})

auth.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const user = await findUserById(c.env.DB, userId)
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  return c.json({ id: user.id, email: user.email })
})

export default auth
