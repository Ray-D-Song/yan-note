import { Hono } from 'hono'
import { createUser, findUserByEmail, findUserById } from '../lib/db'
import { createToken, clearAuthCookie, setAuthCookie } from '../lib/jwt'
import { hashPassword, verifyPassword } from '../lib/password'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

type AuthBindings = CloudflareBindings & {
  JWT_SECRET: string
  JWT_EXPIRES_IN?: string
}

const auth = new Hono<{ Bindings: AuthBindings; Variables: AuthVariables }>()

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function issueSession(
  c: {
    env: AuthBindings
    header: (name: string, value: string) => void
  },
  userId: string,
  email: string,
) {
  const token = await createToken(userId, email, c.env.JWT_SECRET, c.env.JWT_EXPIRES_IN ?? '7d')
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

  const secret = c.env.JWT_SECRET
  if (!secret) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const existing = await findUserByEmail(c.env.DB, email)
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  await createUser(c.env.DB, userId, email, passwordHash)
  await issueSession(c, userId, email.toLowerCase())

  return c.json({ id: userId, email: email.toLowerCase() }, 201)
})

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  const email = body.email?.trim()
  const password = body.password

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const secret = c.env.JWT_SECRET
  if (!secret) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const user = await findUserByEmail(c.env.DB, email)
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  await issueSession(c, user.id, user.email)
  return c.json({ id: user.id, email: user.email })
})

auth.post('/logout', (c) => {
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
