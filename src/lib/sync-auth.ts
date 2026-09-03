export async function noteOwnedByUser(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<boolean> {
  const note = await db
    .prepare('SELECT id FROM notes WHERE id = ? AND user_id = ? AND purged_at IS NULL')
    .bind(noteId, userId)
    .first()
  return note !== null
}

export async function validateNoteParent(
  db: D1Database,
  userId: string,
  parentId: string | null,
  noteId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (parentId === null) {
    return { ok: true }
  }
  if (noteId && parentId === noteId) {
    return { ok: false, reason: 'Cannot be own parent' }
  }
  const parent = await db
    .prepare('SELECT id, deleted_at FROM notes WHERE id = ? AND user_id = ? AND purged_at IS NULL')
    .bind(parentId, userId)
    .first<{ id: string; deleted_at: number | null }>()
  if (!parent || parent.deleted_at !== null) {
    return { ok: false, reason: 'Invalid parent' }
  }
  return { ok: true }
}

export async function validateDatabaseNoteRef(
  db: D1Database,
  userId: string,
  noteId: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (noteId === null) {
    return { ok: true }
  }
  const owned = await noteOwnedByUser(db, userId, noteId)
  if (!owned) {
    return { ok: false, reason: 'Invalid note reference' }
  }
  return { ok: true }
}

export type AuthorizedCell = {
  value: string
  value_clock: string | null
  revision: number
  row_id: string
  property_id: string
  database_id: string
}

export async function findAuthorizedCell(
  db: D1Database,
  userId: string,
  databaseId: string,
  rowId: string,
  propertyId: string,
): Promise<AuthorizedCell | null> {
  return db
    .prepare(
      `SELECT c.value, c.value_clock, c.revision, c.row_id, c.property_id, r.database_id
       FROM database_cells c
       INNER JOIN database_rows r ON r.id = c.row_id
       INNER JOIN databases d ON d.id = r.database_id AND d.user_id = ?
       INNER JOIN database_properties p ON p.id = c.property_id AND p.database_id = r.database_id
       WHERE c.row_id = ? AND c.property_id = ? AND r.database_id = ?`,
    )
    .bind(userId, rowId, propertyId, databaseId)
    .first<AuthorizedCell>()
}

export function validateCellEntityId(
  cellKey: string,
  rowId: string,
  propertyId: string,
): boolean {
  return cellKey === `${rowId}:${propertyId}`
}
