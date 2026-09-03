import { Hono } from 'hono'
import {
  createNote,
  deleteNote,
  emptyTrash,
  findNoteById,
  getNextSortOrder,
  hardDeleteNotes,
  isValidParent,
  listNotesByUser,
  listTrashByUser,
  reorderNotes,
  restoreNotes,
  updateNote,
} from '../lib/db'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const notes = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

notes.use('*', authMiddleware)

notes.get('/', async (c) => {
  const userId = c.get('userId')
  const items = await listNotesByUser(c.env.DB, userId)
  return c.json(items)
})

notes.put('/reorder', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    updates: Array<{
      parent_id: string | null
      ordered_ids: string[]
    }>
  }>()

  if (!Array.isArray(body.updates)) {
    return c.json({ error: 'Invalid reorder payload' }, 400)
  }

  const result = await reorderNotes(c.env.DB, userId, body.updates)
  if ('error' in result) {
    return c.json({ error: result.error }, 400)
  }

  return c.json({ ok: true })
})

notes.get('/trash', async (c) => {
  const userId = c.get('userId')
  const items = await listTrashByUser(c.env.DB, userId)
  return c.json(items)
})

notes.post('/trash/restore', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'Invalid restore payload' }, 400)
  }

  const restored = await restoreNotes(c.env.DB, userId, body.ids)
  return c.json({ ok: true, restored })
})

notes.delete('/trash/all', async (c) => {
  const userId = c.get('userId')
  const deleted = await emptyTrash(c.env.DB, userId)
  return c.json({ ok: true, deleted })
})

notes.delete('/trash', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'Invalid delete payload' }, 400)
  }

  const deleted = await hardDeleteNotes(c.env.DB, userId, body.ids)
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
  if (!(await isValidParent(c.env.DB, userId, parentId))) {
    return c.json({ error: 'Invalid parent note' }, 400)
  }

  const noteId = crypto.randomUUID()
  const sortOrder = await getNextSortOrder(c.env.DB, userId, parentId)
  await createNote(c.env.DB, {
    id: noteId,
    user_id: userId,
    parent_id: parentId,
    title: body.title?.trim() || '无标题',
    content: body.content ?? '',
    icon: body.icon ?? null,
    sort_order: sortOrder,
  })

  const note = await findNoteById(c.env.DB, userId, noteId)
  return c.json(note, 201)
})

notes.put('/:id', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const existing = await findNoteById(c.env.DB, userId, noteId)
  if (!existing) {
    return c.json({ error: 'Note not found' }, 404)
  }

  const body = await c.req.json<{
    title?: string
    content?: string
    parent_id?: string | null
    icon?: string | null
    sort_order?: number
  }>()

  if (body.parent_id !== undefined && body.parent_id === noteId) {
    return c.json({ error: 'Note cannot be its own parent' }, 400)
  }
  if (body.parent_id !== undefined && !(await isValidParent(c.env.DB, userId, body.parent_id))) {
    return c.json({ error: 'Invalid parent note' }, 400)
  }

  const updated = await updateNote(c.env.DB, userId, noteId, {
    title: body.title !== undefined ? body.title.trim() || '无标题' : undefined,
    content: body.content,
    parent_id: body.parent_id,
    icon: body.icon,
    sort_order: body.sort_order,
  })

  if (!updated) {
    return c.json({ error: 'Failed to update note' }, 500)
  }

  const note = await findNoteById(c.env.DB, userId, noteId)
  return c.json(note)
})

notes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const deleted = await deleteNote(c.env.DB, userId, noteId)
  if (!deleted) {
    return c.json({ error: 'Note not found' }, 404)
  }
  return c.json({ ok: true })
})

export default notes
