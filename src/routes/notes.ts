import { Hono } from 'hono'
import { findNoteById, listNotesByUser, listTrashByUser } from '../lib/db'
import { createHLC } from '../lib/hlc'
import { applyLegacyMutation, buildLegacyMutation } from '../lib/legacy-sync'
import { generatePositionKey } from '../lib/position-key'
import { findNote } from '../lib/sync-db'
import { authMiddleware, type AuthVariables } from '../middleware/auth'
import { now } from '../lib/db'

const LEGACY_DEVICE = 'legacy-api'

const notes = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

notes.use('*', authMiddleware)

function legacyClock() {
  return createHLC(now(), LEGACY_DEVICE, null)
}

notes.get('/', async (c) => {
  const userId = c.get('userId')
  return c.json(await listNotesByUser(c.env.DB, userId))
})

notes.put('/reorder', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    updates: Array<{
      parent_id: string | null
      ordered_ids: string[]
      dragged_id?: string
    }>
  }>()

  if (!Array.isArray(body.updates)) {
    return c.json({ error: 'Invalid reorder payload' }, 400)
  }

  for (const update of body.updates) {
    const draggedId = update.dragged_id ?? update.ordered_ids[0]
    if (!draggedId) continue
    const note = await findNote(c.env.DB, userId, draggedId)
    if (!note) continue
    const index = update.ordered_ids.indexOf(draggedId)
    const beforeId = index > 0 ? update.ordered_ids[index - 1] : null
    const afterId = index < update.ordered_ids.length - 1 ? update.ordered_ids[index + 1] : null
    const beforeNote = beforeId ? await findNote(c.env.DB, userId, beforeId) : null
    const afterNote = afterId ? await findNote(c.env.DB, userId, afterId) : null
    const clock = legacyClock()
    const ack = await applyLegacyMutation(
      c.env.DB,
      userId,
      buildLegacyMutation(
        'note',
        draggedId,
        'move',
        {
          parent_id: update.parent_id,
          position_key: generatePositionKey(beforeNote?.position_key ?? null, afterNote?.position_key ?? null),
          parent_clock: clock,
          position_clock: clock,
        },
        note.revision,
      ),
    )
    if (ack.result === 'rejected') {
      return c.json({ error: ack.reason ?? 'Reorder failed' }, 400)
    }
  }

  return c.json({ ok: true })
})

notes.get('/trash', async (c) => {
  const userId = c.get('userId')
  return c.json(await listTrashByUser(c.env.DB, userId))
})

notes.post('/trash/restore', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'Invalid restore payload' }, 400)
  }

  let restored = 0
  for (const id of body.ids) {
    const note = await findNote(c.env.DB, userId, id)
    if (!note) continue
    const ack = await applyLegacyMutation(
      c.env.DB,
      userId,
      buildLegacyMutation('note', id, 'restore', {}, note.revision),
    )
    if (ack.result === 'applied') restored++
  }

  return c.json({ ok: true, restored })
})

notes.delete('/trash/all', async (c) => {
  const userId = c.get('userId')
  const trash = await listTrashByUser(c.env.DB, userId)
  let deleted = 0
  for (const item of trash) {
    const note = await findNote(c.env.DB, userId, item.id)
    if (!note) continue
    const ack = await applyLegacyMutation(
      c.env.DB,
      userId,
      buildLegacyMutation('note', item.id, 'purge', {}, note.revision),
    )
    if (ack.result === 'applied') deleted++
  }
  return c.json({ ok: true, deleted })
})

notes.delete('/trash', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'Invalid delete payload' }, 400)
  }

  let deleted = 0
  for (const id of body.ids) {
    const note = await findNote(c.env.DB, userId, id)
    if (!note) continue
    const ack = await applyLegacyMutation(
      c.env.DB,
      userId,
      buildLegacyMutation('note', id, 'purge', {}, note.revision),
    )
    if (ack.result === 'applied') deleted++
  }

  return c.json({ ok: true, deleted })
})

notes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const note = await findNoteById(c.env.DB, userId, noteId)
  if (!note) {
    return c.json({ error: 'Note not found' }, 404)
  }
  return c.json(note)
})

notes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    title?: string
    parent_id?: string | null
    content?: string
    icon?: string | null
  }>()

  const parentId = body.parent_id ?? null
  const siblings = (await listNotesByUser(c.env.DB, userId)).filter((n) => n.parent_id === parentId)
  const lastSibling = siblings.length > 0 ? siblings[siblings.length - 1] : null
  const positionKey = generatePositionKey(lastSibling?.position_key ?? null, null)

  const noteId = crypto.randomUUID()
  const clock = legacyClock()
  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation('note', noteId, 'create', {
      title: body.title?.trim() || '无标题',
      content: body.content ?? '',
      parent_id: parentId,
      icon: body.icon ?? null,
      position_key: positionKey,
      title_clock: clock,
      content_clock: clock,
      icon_clock: clock,
      parent_clock: clock,
      position_clock: clock,
    }),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Create failed' }, 400)
  }

  const note = await findNoteById(c.env.DB, userId, noteId)
  return c.json(note, 201)
})

notes.put('/:id', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  let existing = await findNote(c.env.DB, userId, noteId)
  if (!existing) {
    return c.json({ error: 'Note not found' }, 404)
  }

  const body = await c.req.json<{
    title?: string
    content?: string
    parent_id?: string | null
    icon?: string | null
  }>()

  const clock = legacyClock()
  const changes: Record<string, unknown> = {}
  if (body.title !== undefined) {
    changes.title = body.title.trim() || '无标题'
    changes.title_clock = clock
  }
  if (body.content !== undefined) {
    changes.content = body.content
    changes.content_clock = clock
  }
  if (body.icon !== undefined) {
    changes.icon = body.icon
    changes.icon_clock = clock
  }

  if (body.parent_id !== undefined && body.parent_id !== existing.parent_id) {
    const siblings = (await listNotesByUser(c.env.DB, userId)).filter(
      (n) => n.parent_id === body.parent_id && n.id !== noteId,
    )
    const lastSibling = siblings.length > 0 ? siblings[siblings.length - 1] : null
    const moveAck = await applyLegacyMutation(
      c.env.DB,
      userId,
      buildLegacyMutation(
        'note',
        noteId,
        'move',
        {
          parent_id: body.parent_id,
          position_key: generatePositionKey(lastSibling?.position_key ?? null, null),
          parent_clock: clock,
          position_clock: clock,
        },
        existing.revision,
      ),
    )
    if (moveAck.result === 'rejected') {
      return c.json({ error: moveAck.reason ?? 'Move failed' }, 400)
    }
    existing = (await findNote(c.env.DB, userId, noteId))!
  }

  if (Object.keys(changes).length === 0) {
    const note = await findNoteById(c.env.DB, userId, noteId)
    return c.json(note)
  }

  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation('note', noteId, 'patch', changes, existing.revision),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Update failed' }, 400)
  }

  const note = await findNoteById(c.env.DB, userId, noteId)
  return c.json(note)
})

notes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const existing = await findNote(c.env.DB, userId, noteId)
  if (!existing) {
    return c.json({ error: 'Note not found' }, 404)
  }

  const ack = await applyLegacyMutation(
    c.env.DB,
    userId,
    buildLegacyMutation('note', noteId, 'soft_delete', {}, existing.revision),
  )

  if (ack.result === 'rejected') {
    return c.json({ error: ack.reason ?? 'Delete failed' }, 400)
  }

  return c.json({ ok: true })
})

export default notes
