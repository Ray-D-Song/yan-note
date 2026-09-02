import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import notesRoutes from './routes/notes'
import type { AuthVariables } from './middleware/auth'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

app.use(
  '/api/v1/*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  }),
)

const v1 = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

v1.route('/auth', authRoutes)
v1.route('/notes', notesRoutes)

app.route('/api/v1', v1)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
