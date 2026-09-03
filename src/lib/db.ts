export type UserRow = {
  id: string
  email: string
  password_hash: string
  created_at: number
}

export type NoteRow = {
  id: string
  user_id: string
  parent_id: string | null
  title: string
  content: string
  icon: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export type NoteListItem = {
  id: string
  parent_id: string | null
  title: string
  icon: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export type NoteReorderUpdate = {
  parent_id: string | null
  ordered_ids: string[]
}

export type SessionRow = {
  id: string
  user_id: string
  expires_at: number
  created_at: number
}

export type SessionWithUserRow = SessionRow & {
  email: string
}

export type DatabaseRow = {
  id: string
  user_id: string
  note_id: string | null
  title: string
  created_at: number
  updated_at: number
}

export type DatabasePropertyRow = {
  id: string
  database_id: string
  name: string
  type: string
  config: string | null
  sort_order: number
}

export type DatabaseDataRow = {
  id: string
  database_id: string
  sort_order: number
  created_at: number
  updated_at: number
}

export type DatabaseListItem = {
  id: string
  note_id: string | null
  title: string
  updated_at: number
}

export type DatabaseProperty = {
  id: string
  name: string
  type: string
  sort_order: number
}

export type DatabaseViewRow = {
  id: string
  sort_order: number
  cells: Record<string, string>
}

export type DatabaseView = {
  id: string
  note_id: string | null
  title: string
  properties: DatabaseProperty[]
  rows: DatabaseViewRow[]
  updated_at: number
}

export function now(): number {
  return Date.now()
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first<UserRow>()
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT id, email, password_hash, created_at FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>()
}

export async function createUser(
  db: D1Database,
  id: string,
  email: string,
  passwordHash: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, email.toLowerCase(), passwordHash, now())
    .run()
}

export async function listNotesByUser(db: D1Database, userId: string): Promise<NoteListItem[]> {
  const result = await db
    .prepare(
      `SELECT id, parent_id, title, icon, sort_order, created_at, updated_at
       FROM notes
       WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(userId)
    .all<NoteListItem>()
  return result.results ?? []
}

export async function getNextSortOrder(
  db: D1Database,
  userId: string,
  parentId: string | null,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM notes
       WHERE user_id = ?
         AND (
           (parent_id IS NULL AND ? IS NULL)
           OR parent_id = ?
         )`,
    )
    .bind(userId, parentId, parentId)
    .first<{ next_order: number }>()

  return row?.next_order ?? 0
}

async function listNoteParentIds(
  db: D1Database,
  userId: string,
): Promise<Array<{ id: string; parent_id: string | null }>> {
  const result = await db
    .prepare('SELECT id, parent_id FROM notes WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; parent_id: string | null }>()
  return result.results ?? []
}

function isDescendantOf(
  notes: Array<{ id: string; parent_id: string | null }>,
  ancestorId: string,
  nodeId: string,
): boolean {
  const parentById = new Map(notes.map((note) => [note.id, note.parent_id]))
  let current: string | null | undefined = nodeId

  while (current) {
    if (current === ancestorId) {
      return true
    }
    current = parentById.get(current) ?? null
  }

  return false
}

export async function reorderNotes(
  db: D1Database,
  userId: string,
  updates: NoteReorderUpdate[],
): Promise<{ ok: true } | { error: string }> {
  if (updates.length === 0) {
    return { ok: true }
  }

  const noteParents = await listNoteParentIds(db, userId)
  const noteIds = new Set(noteParents.map((note) => note.id))

  for (const update of updates) {
    if (!(await isValidParent(db, userId, update.parent_id))) {
      return { error: 'Invalid parent note' }
    }

    if (update.ordered_ids.length === 0) {
      continue
    }

    for (const noteId of update.ordered_ids) {
      if (!noteIds.has(noteId)) {
        return { error: 'Note not found' }
      }

      const current = noteParents.find((note) => note.id === noteId)
      const parentChanged = current?.parent_id !== update.parent_id

      if (parentChanged) {
        if (update.parent_id === noteId) {
          return { error: 'Note cannot be its own parent' }
        }
        if (update.parent_id && isDescendantOf(noteParents, noteId, update.parent_id)) {
          return { error: 'Cannot move note into its own descendant' }
        }
      }
    }
  }

  const timestamp = now()
  const statements = []

  for (const update of updates) {
    update.ordered_ids.forEach((noteId, index) => {
      statements.push(
        db
          .prepare(
            `UPDATE notes
             SET sort_order = ?, parent_id = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          )
          .bind(index, update.parent_id, timestamp, noteId, userId),
      )
    })
  }

  if (statements.length > 0) {
    await db.batch(statements)
  }

  return { ok: true }
}

export async function findNoteById(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<NoteRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, parent_id, title, content, icon, sort_order, created_at, updated_at
       FROM notes
       WHERE id = ? AND user_id = ?`,
    )
    .bind(noteId, userId)
    .first<NoteRow>()
}

export async function createNote(
  db: D1Database,
  note: Omit<NoteRow, 'created_at' | 'updated_at'> & { created_at?: number; updated_at?: number },
): Promise<void> {
  const timestamp = now()
  await db
    .prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      note.id,
      note.user_id,
      note.parent_id,
      note.title,
      note.content,
      note.icon,
      note.sort_order,
      note.created_at ?? timestamp,
      note.updated_at ?? timestamp,
    )
    .run()
}

export async function updateNote(
  db: D1Database,
  userId: string,
  noteId: string,
  fields: Partial<Pick<NoteRow, 'title' | 'content' | 'parent_id' | 'icon' | 'sort_order'>>,
): Promise<boolean> {
  const sets: string[] = []
  const values: unknown[] = []

  if (fields.title !== undefined) {
    sets.push('title = ?')
    values.push(fields.title)
  }
  if (fields.content !== undefined) {
    sets.push('content = ?')
    values.push(fields.content)
  }
  if (fields.parent_id !== undefined) {
    sets.push('parent_id = ?')
    values.push(fields.parent_id)
  }
  if (fields.icon !== undefined) {
    sets.push('icon = ?')
    values.push(fields.icon)
  }
  if (fields.sort_order !== undefined) {
    sets.push('sort_order = ?')
    values.push(fields.sort_order)
  }

  if (sets.length === 0) {
    return true
  }

  sets.push('updated_at = ?')
  values.push(now())
  values.push(noteId, userId)

  const result = await db
    .prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run()

  return (result.meta.changes ?? 0) > 0
}

export async function deleteNote(db: D1Database, userId: string, noteId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .bind(noteId, userId)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export async function isValidParent(
  db: D1Database,
  userId: string,
  parentId: string | null,
): Promise<boolean> {
  if (parentId === null) {
    return true
  }
  const parent = await findNoteById(db, userId, parentId)
  return parent !== null
}

export async function createSessionRecord(
  db: D1Database,
  session: SessionRow,
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(session.id, session.user_id, session.expires_at, session.created_at)
    .run()
}

export async function findSessionWithUser(
  db: D1Database,
  sessionId: string,
): Promise<SessionWithUserRow | null> {
  return db
    .prepare(
      `SELECT s.id, s.user_id, s.expires_at, s.created_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .bind(sessionId)
    .first<SessionWithUserRow>()
}

export async function deleteSessionRecord(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
}

export async function listDatabasesByUser(
  db: D1Database,
  userId: string,
): Promise<DatabaseListItem[]> {
  const result = await db
    .prepare(
      `SELECT id, note_id, title, updated_at
       FROM databases
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<DatabaseListItem>()
  return result.results ?? []
}

export async function findDatabaseById(
  db: D1Database,
  userId: string,
  databaseId: string,
): Promise<DatabaseRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, note_id, title, created_at, updated_at
       FROM databases
       WHERE id = ? AND user_id = ?`,
    )
    .bind(databaseId, userId)
    .first<DatabaseRow>()
}

async function ensureDefaultProperties(db: D1Database, databaseId: string): Promise<void> {
  const existing = await db
    .prepare('SELECT id FROM database_properties WHERE database_id = ? LIMIT 1')
    .bind(databaseId)
    .first<{ id: string }>()

  if (existing) {
    return
  }

  const timestamp = now()
  await db.batch([
    db
      .prepare(
        `INSERT INTO database_properties (id, database_id, name, type, config, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(`${databaseId}-title`, databaseId, '名称', 'text', null, 0),
    db
      .prepare(
        `INSERT INTO database_properties (id, database_id, name, type, config, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(`${databaseId}-status`, databaseId, '状态', 'text', null, 1),
  ])
}

export async function createDatabase(
  db: D1Database,
  database: Pick<DatabaseRow, 'id' | 'user_id' | 'note_id' | 'title'>,
): Promise<void> {
  const timestamp = now()
  await db
    .prepare(
      `INSERT INTO databases (id, user_id, note_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      database.id,
      database.user_id,
      database.note_id,
      database.title,
      timestamp,
      timestamp,
    )
    .run()

  await ensureDefaultProperties(db, database.id)
}

export async function updateDatabaseMeta(
  db: D1Database,
  userId: string,
  databaseId: string,
  fields: Partial<Pick<DatabaseRow, 'title'>>,
): Promise<boolean> {
  if (fields.title === undefined) {
    return true
  }

  const result = await db
    .prepare(
      `UPDATE databases
       SET title = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(fields.title, now(), databaseId, userId)
    .run()

  return (result.meta.changes ?? 0) > 0
}

export async function createDatabaseRow(
  db: D1Database,
  databaseId: string,
): Promise<DatabaseViewRow> {
  const rowId = crypto.randomUUID()
  const timestamp = now()
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM database_rows WHERE database_id = ?')
    .bind(databaseId)
    .first<{ count: number }>()
  const sortOrder = countResult?.count ?? 0

  const properties = await db
    .prepare(
      `SELECT id
       FROM database_properties
       WHERE database_id = ?
       ORDER BY sort_order ASC`,
    )
    .bind(databaseId)
    .all<{ id: string }>()

  const propertyIds = properties.results ?? []
  const cells: Record<string, string> = {}

  const statements = [
    db
      .prepare(
        `INSERT INTO database_rows (id, database_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(rowId, databaseId, sortOrder, timestamp, timestamp),
    db
      .prepare('UPDATE databases SET updated_at = ? WHERE id = ?')
      .bind(timestamp, databaseId),
  ]

  for (const property of propertyIds) {
    cells[property.id] = ''
    statements.push(
      db
        .prepare(
          `INSERT INTO database_cells (row_id, property_id, value)
           VALUES (?, ?, ?)`,
        )
        .bind(rowId, property.id, ''),
    )
  }

  await db.batch(statements)

  return {
    id: rowId,
    sort_order: sortOrder,
    cells,
  }
}

export async function updateDatabaseCell(
  db: D1Database,
  databaseId: string,
  rowId: string,
  propertyId: string,
  value: string,
): Promise<void> {
  const timestamp = now()
  await db.batch([
    db
      .prepare(
        `INSERT INTO database_cells (row_id, property_id, value)
         VALUES (?, ?, ?)
         ON CONFLICT(row_id, property_id) DO UPDATE SET value = excluded.value`,
      )
      .bind(rowId, propertyId, value),
    db
      .prepare('UPDATE database_rows SET updated_at = ? WHERE id = ? AND database_id = ?')
      .bind(timestamp, rowId, databaseId),
    db
      .prepare('UPDATE databases SET updated_at = ? WHERE id = ?')
      .bind(timestamp, databaseId),
  ])
}

export async function getDatabaseView(
  db: D1Database,
  userId: string,
  databaseId: string,
): Promise<DatabaseView | null> {
  const database = await findDatabaseById(db, userId, databaseId)
  if (!database) {
    return null
  }

  await ensureDefaultProperties(db, databaseId)

  const propertiesResult = await db
    .prepare(
      `SELECT id, name, type, sort_order
       FROM database_properties
       WHERE database_id = ?
       ORDER BY sort_order ASC`,
    )
    .bind(databaseId)
    .all<DatabaseProperty>()

  const rowsResult = await db
    .prepare(
      `SELECT id, sort_order
       FROM database_rows
       WHERE database_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(databaseId)
    .all<{ id: string; sort_order: number }>()

  const cellsResult = await db
    .prepare(
      `SELECT c.row_id, c.property_id, c.value
       FROM database_cells c
       JOIN database_rows r ON r.id = c.row_id
       WHERE r.database_id = ?`,
    )
    .bind(databaseId)
    .all<{ row_id: string; property_id: string; value: string }>()

  const cellsByRow = new Map<string, Record<string, string>>()
  for (const cell of cellsResult.results ?? []) {
    const rowCells = cellsByRow.get(cell.row_id) ?? {}
    rowCells[cell.property_id] = cell.value
    cellsByRow.set(cell.row_id, rowCells)
  }

  return {
    id: database.id,
    note_id: database.note_id,
    title: database.title,
    updated_at: database.updated_at,
    properties: propertiesResult.results ?? [],
    rows: (rowsResult.results ?? []).map((row) => ({
      id: row.id,
      sort_order: row.sort_order,
      cells: cellsByRow.get(row.id) ?? {},
    })),
  }
}
