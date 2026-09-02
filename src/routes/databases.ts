import { Hono } from 'hono'
import {
  createDatabase,
  createDatabaseRow,
  findDatabaseById,
  getDatabaseView,
  listDatabasesByUser,
  updateDatabaseCell,
  updateDatabaseMeta,
} from '../lib/db'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const databases = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

databases.use('*', authMiddleware)

databases.get('/', async (c) => {
  const userId = c.get('userId')
  const items = await listDatabasesByUser(c.env.DB, userId)
  return c.json(items)
})

databases.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ title?: string; note_id?: string | null }>()
  const databaseId = crypto.randomUUID()
  await createDatabase(c.env.DB, {
    id: databaseId,
    user_id: userId,
    note_id: body.note_id ?? null,
    title: body.title?.trim() || '新数据库',
  })
  const database = await getDatabaseView(c.env.DB, userId, databaseId)
  return c.json(database, 201)
})

databases.get('/:id', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const database = await getDatabaseView(c.env.DB, userId, databaseId)
  if (!database) {
    return c.json({ error: 'Database not found' }, 404)
  }
  return c.json(database)
})

databases.put('/:id', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const existing = await findDatabaseById(c.env.DB, userId, databaseId)
  if (!existing) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const body = await c.req.json<{ title?: string }>()
  await updateDatabaseMeta(c.env.DB, userId, databaseId, {
    title: body.title?.trim(),
  })
  const database = await getDatabaseView(c.env.DB, userId, databaseId)
  return c.json(database)
})

databases.post('/:id/rows', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const existing = await findDatabaseById(c.env.DB, userId, databaseId)
  if (!existing) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const row = await createDatabaseRow(c.env.DB, databaseId)
  const database = await getDatabaseView(c.env.DB, userId, databaseId)
  return c.json({ row, database }, 201)
})

databases.put('/:id/rows/:rowId/cells/:propertyId', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const rowId = c.req.param('rowId')
  const propertyId = c.req.param('propertyId')
  const existing = await findDatabaseById(c.env.DB, userId, databaseId)
  if (!existing) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const body = await c.req.json<{ value?: string }>()
  await updateDatabaseCell(c.env.DB, databaseId, rowId, propertyId, body.value ?? '')
  return c.json({ ok: true })
})

export default databases
