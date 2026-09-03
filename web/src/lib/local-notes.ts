import {
  commitLocalDeleteWithOutbox,
  commitLocalWrite,
  getLocalNote,
  listLocalNotes,
  listTrashNotes,
  openAccountDb,
} from '@/lib/idb/database'
import { createOutboxEntry, getClientClock, scheduleSync } from '@/lib/sync/engine'
import { generatePositionKey, positionKeyForIndex } from '@/lib/sync/position-key'
import type { LocalNote } from '@/lib/sync/types'
import { collectDescendantIds, isDescendantOfNote } from '@/types/note'

function toListItem(note: LocalNote) {
  return {
    id: note.id,
    parent_id: note.parent_id,
    title: note.title,
    icon: note.icon,
    position_key: note.position_key,
    sort_order: 0,
    revision: note.revision,
    created_at: note.created_at,
    updated_at: note.updated_at,
  }
}

function toNote(note: LocalNote, userId: string) {
  return {
    ...toListItem(note),
    user_id: userId,
    content: note.content,
  }
}

export async function loadNotesFromLocal(userId: string) {
  const db = await openAccountDb(userId)
  const notes = await listLocalNotes(db)
  return notes.map(toListItem)
}

export async function loadNoteFromLocal(userId: string, id: string) {
  const db = await openAccountDb(userId)
  const note = await getLocalNote(db, id)
  if (!note || note.deleted_at) {
    return null
  }
  return toNote(note, userId)
}

export async function loadTrashFromLocal(userId: string) {
  const db = await openAccountDb(userId)
  const notes = await listTrashNotes(db)
  return notes.map((n) => ({ ...toListItem(n), deleted_at: n.deleted_at! }))
}

export async function createNoteLocal(
  userId: string,
  payload: {
    id?: string
    title?: string
    parent_id?: string | null
    content?: string
    icon?: string | null
  },
) {
  const db = await openAccountDb(userId)
  const siblings = (await listLocalNotes(db)).filter(
    (n) => n.parent_id === (payload.parent_id ?? null),
  )
  siblings.sort((a, b) => a.position_key.localeCompare(b.position_key))

  const timestamp = Date.now()
  const note: LocalNote = {
    id: payload.id ?? crypto.randomUUID(),
    parent_id: payload.parent_id ?? null,
    title: payload.title?.trim() || '无标题',
    content: payload.content ?? '',
    icon: payload.icon ?? null,
    position_key: positionKeyForIndex(siblings, siblings.length),
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    title_clock: getClientClock().now(),
    content_clock: getClientClock().now(),
    icon_clock: getClientClock().now(),
    parent_clock: getClientClock().now(),
    position_clock: getClientClock().now(),
  }

  const outbox = createOutboxEntry('note', note.id, 'create', 0, {
    title: note.title,
    content: note.content,
    icon: note.icon,
    parent_id: note.parent_id,
    position_key: note.position_key,
  })

  await commitLocalWrite(db, { note, outbox })
  scheduleSync(userId, { reason: 'local_edit' })
  return toNote(note, userId)
}

export async function updateNoteLocal(
  userId: string,
  id: string,
  fields: Partial<Pick<LocalNote, 'title' | 'content' | 'icon'>>,
) {
  const db = await openAccountDb(userId)
  const note = await getLocalNote(db, id)
  if (!note || note.deleted_at) {
    throw new Error('Note not found')
  }

  const clock = getClientClock().now()
  const changes: Record<string, unknown> = {}
  const timestamp = Date.now()

  if (fields.title !== undefined) {
    note.title = fields.title.trim() || '无标题'
    note.title_clock = clock
    changes.title = note.title
    changes.title_clock = clock
  }
  if (fields.content !== undefined) {
    note.content = fields.content
    note.content_clock = clock
    changes.content = note.content
    changes.content_clock = clock
  }
  if (fields.icon !== undefined) {
    note.icon = fields.icon
    note.icon_clock = clock
    changes.icon = note.icon
    changes.icon_clock = clock
  }

  note.updated_at = timestamp

  const outbox = createOutboxEntry('note', id, 'patch', note.revision, changes)
  await commitLocalWrite(db, { note, outbox })
  scheduleSync(userId, { reason: 'local_edit' })
  return toNote(note, userId)
}

export async function moveNoteLocal(
  userId: string,
  draggedId: string,
  parentId: string | null,
  orderedIds: string[],
) {
  const db = await openAccountDb(userId)
  const note = await getLocalNote(db, draggedId)
  if (!note) return

  const allListItems = (await listLocalNotes(db)).map(toListItem)
  const index = orderedIds.indexOf(draggedId)
  const beforeNote = index > 0 ? await getLocalNote(db, orderedIds[index - 1]!) : null
  const afterNote = index < orderedIds.length - 1 ? await getLocalNote(db, orderedIds[index + 1]!) : null
  const newPositionKey = generatePositionKey(beforeNote?.position_key ?? null, afterNote?.position_key ?? null)

  if (parentId === draggedId) {
    throw new Error('Cannot be own parent')
  }
  if (parentId && isDescendantOfNote(allListItems, draggedId, parentId)) {
    throw new Error('Circular parent')
  }

  const clock = getClientClock().now()
  note.parent_id = parentId
  note.position_key = newPositionKey
  note.parent_clock = clock
  note.position_clock = clock
  note.updated_at = Date.now()

  const outbox = createOutboxEntry('note', draggedId, 'move', note.revision, {
    parent_id: parentId,
    position_key: newPositionKey,
    parent_clock: clock,
    position_clock: clock,
  })
  await commitLocalWrite(db, { note, outbox })
  scheduleSync(userId, { reason: 'local_edit' })
}

export async function deleteNoteLocal(userId: string, id: string) {
  const db = await openAccountDb(userId)
  const allNotes = (await listLocalNotes(db)).map(toListItem)
  const ids = collectDescendantIds(allNotes, id)
  const timestamp = Date.now()

  for (const noteId of ids) {
    const note = await getLocalNote(db, noteId)
    if (!note) continue
    note.deleted_at = timestamp
    note.updated_at = timestamp
    note.revision += 1
    const outbox = createOutboxEntry('note', noteId, 'soft_delete', note.revision - 1, {})
    await commitLocalWrite(db, { note, outbox })
  }

  scheduleSync(userId, { reason: 'local_edit' })
}

export async function restoreNotesLocal(userId: string, ids: string[]) {
  const db = await openAccountDb(userId)
  for (const id of ids) {
    const note = await getLocalNote(db, id)
    if (!note || !note.deleted_at) continue
    note.deleted_at = null
    note.updated_at = Date.now()
    const outbox = createOutboxEntry('note', id, 'restore', note.revision, {})
    await commitLocalWrite(db, { note, outbox })
  }
  scheduleSync(userId, { reason: 'local_edit' })
}

export async function hardDeleteNotesLocal(userId: string, ids: string[]) {
  const db = await openAccountDb(userId)
  for (const id of ids) {
    const note = await getLocalNote(db, id)
    if (!note) continue
    const outbox = createOutboxEntry('note', id, 'purge', note.revision, {})
    await commitLocalDeleteWithOutbox(db, id, outbox)
  }
  scheduleSync(userId, { reason: 'local_edit' })
}
