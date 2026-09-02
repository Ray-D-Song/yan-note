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
  updated_at: number
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
      `SELECT id, parent_id, title, icon, sort_order, updated_at
       FROM notes
       WHERE user_id = ?
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .bind(userId)
    .all<NoteListItem>()
  return result.results ?? []
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
