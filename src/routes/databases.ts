import { Hono } from 'hono'
import { getDatabaseView, listDatabasesByUser } from '../lib/db'
import { createHLC } from '../lib/hlc'
import { applyLegacyMutation, buildLegacyMutation } from '../lib/legacy-sync'
import { findNote } from '../lib/sync-db'
import { authMiddleware, type AuthVariables } from '../middleware/auth'
import { now } from '../lib/db'

const LEGACY_DEVICE = 'legacy-api'

const databases = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

databases.use('*', authMiddleware)

function legacyClock() {
  return createHLC(now(), LEGACY_DEVICE, null)
}

databases.get('/', async (c) => {
  const userId = c.get('userId')
  return c.json(await listDatabasesByUser(c.env.DB, userId))
})

databases.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ title?: string; note_id?: string | null }>()
  const databaseId = crypto.randomUUID()
  const clock = legacyClock()

  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation('database', databaseId, 'create', {
      title: body.title?.trim() || '新数据库',
      note_id: body.note_id ?? null,
      title_clock: clock,
    }),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Create failed' }, 400)
  }

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
  const existing = await c.env.DB.prepare(
    'SELECT revision FROM databases WHERE id = ? AND user_id = ?',
  ).bind(databaseId, userId).first<{ revision: number }>()

  if (!existing) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const body = await c.req.json<{ title?: string }>()
  if (body.title === undefined) {
    return c.json(await getDatabaseView(c.env.DB, userId, databaseId))
  }

  const clock = legacyClock()
  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation(
      'database',
      databaseId,
      'patch',
      { title: body.title.trim(), title_clock: clock },
      existing.revision,
    ),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Update failed' }, 400)
  }

  return c.json(await getDatabaseView(c.env.DB, userId, databaseId))
})

databases.post('/:id/rows', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const view = await getDatabaseView(c.env.DB, userId, databaseId)
  if (!view) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const rowId = crypto.randomUUID()
  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation('database_row', rowId, 'create', {
      database_id: databaseId,
      sort_order: view.rows.length,
    }),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Create row failed' }, 400)
  }

  const database = await getDatabaseView(c.env.DB, userId, databaseId)
  const row = database?.rows.find((r) => r.id === rowId)
  return c.json({ row, database }, 201)
})

databases.put('/:id/rows/:rowId/cells/:propertyId', async (c) => {
  const userId = c.get('userId')
  const databaseId = c.req.param('id')
  const rowId = c.req.param('rowId')
  const propertyId = c.req.param('propertyId')
  const view = await getDatabaseView(c.env.DB, userId, databaseId)
  if (!view) {
    return c.json({ error: 'Database not found' }, 404)
  }

  const body = await c.req.json<{ value?: string }>()
  const value = body.value ?? ''
  const cellKey = `${rowId}:${propertyId}`
  const clock = legacyClock()

  const cell = await c.env.DB.prepare(
    'SELECT revision FROM database_cells WHERE row_id = ? AND property_id = ?',
  ).bind(rowId, propertyId).first<{ revision: number }>()

  if (!cell) {
    return c.json({ error: 'Cell not found' }, 404)
  }

  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation(
      'database_cell',
      cellKey,
      'patch',
      {
        row_id: rowId,
        property_id: propertyId,
        value,
        database_id: databaseId,
        value_clock: clock,
      },
      cell.revision,
    ),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Update failed' }, 400)
  }

  return c.json({ ok: true })
})

export default databases
