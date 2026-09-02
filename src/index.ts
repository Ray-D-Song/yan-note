import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import databasesRoutes from './routes/databases'
import notesRoutes from './routes/notes'
import uploadsRoutes from './routes/uploads'
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
v1.route('/databases', databasesRoutes)
v1.route('/uploads', uploadsRoutes)

app.route('/api/v1', v1)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
