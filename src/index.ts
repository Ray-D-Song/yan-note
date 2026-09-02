import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import notesRoutes from './routes/notes'
import type { AuthVariables } from './middleware/auth'

type AppBindings = CloudflareBindings & {
  JWT_SECRET: string
  JWT_EXPIRES_IN?: string
}

const app = new Hono<{ Bindings: AppBindings; Variables: AuthVariables }>()

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
  }),
)

app.route('/api/auth', authRoutes)
app.route('/api/notes', notesRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
