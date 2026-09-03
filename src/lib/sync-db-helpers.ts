import { now } from './db'
import type { EntityType, MutationKind } from './sync-types'

export function insertSyncChange(
  db: D1Database,
  userId: string,
  entityType: EntityType,
  entityId: string,
  revision: number,
  operation: MutationKind,
  payload: Record<string, unknown>,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, entityType, entityId, revision, operation, JSON.stringify(payload), timestamp)
}

/** Only writes when this mutation won the note CAS (last_mutation_id matches). */
export function insertSyncChangeIfNoteMutation(
  db: D1Database,
  userId: string,
  noteId: string,
  mutationId: string,
  entityType: EntityType,
  entityId: string,
  revision: number,
  operation: MutationKind,
  payload: Record<string, unknown>,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      entityType,
      entityId,
      revision,
      operation,
      JSON.stringify(payload),
      timestamp,
      noteId,
      userId,
      mutationId,
    )
}

export function insertSyncChangeIfDatabaseMutation(
  db: D1Database,
  userId: string,
  databaseId: string,
  mutationId: string,
  entityType: EntityType,
  entityId: string,
  revision: number,
  operation: MutationKind,
  payload: Record<string, unknown>,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       FROM databases WHERE id = ? AND user_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      entityType,
      entityId,
      revision,
      operation,
      JSON.stringify(payload),
      timestamp,
      databaseId,
      userId,
      mutationId,
    )
}

export function insertSyncChangeIfCellMutation(
  db: D1Database,
  userId: string,
  rowId: string,
  propertyId: string,
  mutationId: string,
  entityType: EntityType,
  entityId: string,
  revision: number,
  operation: MutationKind,
  payload: Record<string, unknown>,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       FROM database_cells
       WHERE row_id = ? AND property_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      entityType,
      entityId,
      revision,
      operation,
      JSON.stringify(payload),
      timestamp,
      rowId,
      propertyId,
      mutationId,
    )
}

export function recordAppliedMutation(
  db: D1Database,
  userId: string,
  mutation: { mutation_id: string; device_id: string; entity_type: EntityType; entity_id: string },
  ack: { mutation_id: string; result: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO applied_mutations (user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      mutation.mutation_id,
      mutation.device_id,
      mutation.entity_type,
      mutation.entity_id,
      ack.result,
      JSON.stringify(ack),
      now(),
    )
}

export function recordAppliedMutationIfNoteMutation(
  db: D1Database,
  userId: string,
  mutation: { mutation_id: string; device_id: string; entity_type: EntityType; entity_id: string },
  ack: { mutation_id: string; result: string },
  noteId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO applied_mutations (user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      mutation.mutation_id,
      mutation.device_id,
      mutation.entity_type,
      mutation.entity_id,
      ack.result,
      JSON.stringify(ack),
      now(),
      noteId,
      userId,
      mutationId,
    )
}

export function recordAppliedMutationIfDatabaseMutation(
  db: D1Database,
  userId: string,
  mutation: { mutation_id: string; device_id: string; entity_type: EntityType; entity_id: string },
  ack: { mutation_id: string; result: string },
  databaseId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO applied_mutations (user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM databases WHERE id = ? AND user_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      mutation.mutation_id,
      mutation.device_id,
      mutation.entity_type,
      mutation.entity_id,
      ack.result,
      JSON.stringify(ack),
      now(),
      databaseId,
      userId,
      mutationId,
    )
}

export function recordAppliedMutationIfCellMutation(
  db: D1Database,
  userId: string,
  mutation: { mutation_id: string; device_id: string; entity_type: EntityType; entity_id: string },
  ack: { mutation_id: string; result: string },
  rowId: string,
  propertyId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO applied_mutations (user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM database_cells
       WHERE row_id = ? AND property_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      userId,
      mutation.mutation_id,
      mutation.device_id,
      mutation.entity_type,
      mutation.entity_id,
      ack.result,
      JSON.stringify(ack),
      now(),
      rowId,
      propertyId,
      mutationId,
    )
}

export function softDeleteDescendantIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  noteId: string,
  timestamp: number,
  treeLock: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE notes SET deleted_at = ?, updated_at = ?, revision = revision + 1
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree WHERE id != ?
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )
       AND EXISTS (
         SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?
       )`,
    )
    .bind(
      timestamp,
      timestamp,
      noteId,
      userId,
      rootNoteId,
      userId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      mutationId,
      userId,
      treeLock,
    )
}

export function softDeleteSubtreeDescendantsIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
  treeLock: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE notes SET deleted_at = ?, updated_at = ?, revision = revision + 1, last_mutation_id = ?
       WHERE user_id = ? AND deleted_at IS NULL AND id != ?
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree WHERE id != ?
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )
       AND EXISTS (
         SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?
       )`,
    )
    .bind(
      timestamp,
      timestamp,
      mutationId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      mutationId,
      userId,
      treeLock,
    )
}

export function insertSoftDeleteChangesForSubtreeIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, 'note', n.id, n.revision, 'soft_delete', '{}', ?
       FROM notes n
       WHERE n.user_id = ? AND n.deleted_at = ?
       AND n.id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT child.id FROM notes child
           INNER JOIN subtree s ON child.parent_id = s.id
           WHERE child.user_id = ?
         )
         SELECT id FROM subtree
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(
      userId,
      timestamp,
      userId,
      timestamp,
      rootNoteId,
      userId,
      userId,
      rootNoteId,
      userId,
      mutationId,
    )
}

export function reparentActiveSubtreeIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
  treeLock: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE notes SET parent_id = NULL, parent_clock = NULL, updated_at = ?, revision = revision + 1, last_mutation_id = ?
       WHERE user_id = ? AND deleted_at IS NULL AND id != ?
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree WHERE id != ?
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )
       AND EXISTS (
         SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?
       )`,
    )
    .bind(
      timestamp,
      mutationId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      mutationId,
      userId,
      treeLock,
    )
}

export function insertMoveChangesForReparentedIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, 'note', id, revision, 'move',
         json_object(
           'parent_id', NULL,
           'position_key', position_key,
           'parent_clock', parent_clock,
           'position_clock', position_clock,
           'authoritative', 1
         ),
         ?
       FROM notes
       WHERE user_id = ? AND last_mutation_id = ? AND parent_id IS NULL AND updated_at = ? AND id != ?
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(
      userId,
      timestamp,
      userId,
      mutationId,
      timestamp,
      rootNoteId,
      rootNoteId,
      userId,
      mutationId,
    )
}

export function insertPurgeChangesForDeletedSubtreeIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, 'note', id, revision, 'purge', '{}', ?
       FROM notes
       WHERE user_id = ? AND deleted_at IS NOT NULL
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(userId, timestamp, userId, rootNoteId, userId, userId, rootNoteId, userId, mutationId)
}

export function recordPurgedEntitiesForDeletedSubtreeIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR REPLACE INTO purged_entities (user_id, entity_type, entity_id, purged_at)
       SELECT ?, 'note', id, ?
       FROM notes
       WHERE user_id = ? AND deleted_at IS NOT NULL
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(userId, timestamp, userId, rootNoteId, userId, userId, rootNoteId, userId, mutationId)
}

export function deleteDeletedSubtreeIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM notes
       WHERE user_id = ? AND deleted_at IS NOT NULL AND id != ?
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree WHERE id != ?
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(userId, rootNoteId, rootNoteId, userId, userId, rootNoteId, rootNoteId, userId, mutationId)
}

export function deletePurgeRootIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM notes
       WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM notes n
         WHERE n.user_id = ? AND n.deleted_at IS NULL AND n.purged_at IS NULL AND n.id != ?
         AND n.id IN (
           WITH RECURSIVE subtree(id) AS (
             SELECT id FROM notes WHERE id = ? AND user_id = ?
             UNION ALL
             SELECT c.id FROM notes c
             INNER JOIN subtree s ON c.parent_id = s.id
             WHERE c.user_id = ?
           )
           SELECT id FROM subtree WHERE id != ?
         )
       )`,
    )
    .bind(rootNoteId, userId, rootNoteId, userId, mutationId, userId, rootNoteId, rootNoteId, userId, userId, rootNoteId)
}

export function deleteNoteIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  noteId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(noteId, userId, rootNoteId, userId, mutationId)
}

export function recordPurgedEntityIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  entityType: EntityType,
  entityId: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR REPLACE INTO purged_entities (user_id, entity_type, entity_id, purged_at)
       SELECT ?, ?, ?, ?
       FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(userId, entityType, entityId, timestamp, entityId, userId, rootNoteId, userId, mutationId)
}

export function insertSyncChangeIfNotePurgeTarget(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  entityId: string,
  revision: number,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sync_changes (user_id, entity_type, entity_id, revision, operation, payload, created_at)
       SELECT ?, 'note', ?, ?, 'purge', '{}', ?
       FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(userId, entityId, revision, timestamp, entityId, userId, rootNoteId, userId, mutationId)
}

export function reparentNoteIfRootMutation(
  db: D1Database,
  userId: string,
  rootNoteId: string,
  mutationId: string,
  noteId: string,
  timestamp: number,
  treeLock: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE notes SET parent_id = NULL, updated_at = ?, revision = revision + 1, last_mutation_id = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       AND id IN (
         WITH RECURSIVE subtree(id) AS (
           SELECT id FROM notes WHERE id = ? AND user_id = ?
           UNION ALL
           SELECT n.id FROM notes n
           INNER JOIN subtree s ON n.parent_id = s.id
           WHERE n.user_id = ?
         )
         SELECT id FROM subtree WHERE id != ?
       )
       AND EXISTS (
         SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?
       )
       AND EXISTS (
         SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?
       )`,
    )
    .bind(
      timestamp,
      mutationId,
      noteId,
      userId,
      rootNoteId,
      userId,
      userId,
      rootNoteId,
      rootNoteId,
      userId,
      mutationId,
      userId,
      treeLock,
    )
}

export function saveNoteVersionIfNoteMutation(
  db: D1Database,
  userId: string,
  noteId: string,
  mutationId: string,
  versionId: string,
  revision: number,
  snapshot: string,
  deviceId: string,
  fieldName: string,
  timestamp: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO note_versions (id, note_id, user_id, revision, snapshot, device_id, field_name, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM notes WHERE id = ? AND user_id = ? AND last_mutation_id = ?`,
    )
    .bind(
      versionId,
      noteId,
      userId,
      revision,
      snapshot,
      deviceId,
      fieldName,
      timestamp,
      noteId,
      userId,
      mutationId,
    )
}

export function deleteOldNoteVersionsIfNoteMutation(
  db: D1Database,
  noteId: string,
  mutationId: string,
  cutoff: number,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM note_versions WHERE note_id = ? AND created_at < ?
       AND EXISTS (SELECT 1 FROM notes WHERE id = ? AND last_mutation_id = ?)`,
    )
    .bind(noteId, cutoff, noteId, mutationId)
}

export function trimNoteVersionsIfNoteMutation(
  db: D1Database,
  noteId: string,
  mutationId: string,
  maxCount: number,
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM note_versions WHERE note_id = ? AND id NOT IN (
         SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT ?
       )
       AND EXISTS (SELECT 1 FROM notes WHERE id = ? AND last_mutation_id = ?)`,
    )
    .bind(noteId, noteId, maxCount, noteId, mutationId)
}

export async function getUserTreeLock(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT note_tree_lock FROM users WHERE id = ?')
    .bind(userId)
    .first<{ note_tree_lock: number }>()
  return row?.note_tree_lock ?? 0
}

export function incrementUserTreeLockIfMatch(
  db: D1Database,
  userId: string,
  expectedLock: number,
): D1PreparedStatement {
  return db
    .prepare('UPDATE users SET note_tree_lock = note_tree_lock + 1 WHERE id = ? AND note_tree_lock = ?')
    .bind(userId, expectedLock)
}

export function touchRowIfCellMutation(
  db: D1Database,
  timestamp: number,
  rowId: string,
  propertyId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE database_rows SET updated_at = ?
       WHERE id = ?
       AND EXISTS (
         SELECT 1 FROM database_cells
         WHERE row_id = ? AND property_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(timestamp, rowId, rowId, propertyId, mutationId)
}

export function touchDatabaseIfCellMutation(
  db: D1Database,
  userId: string,
  timestamp: number,
  databaseId: string,
  rowId: string,
  propertyId: string,
  mutationId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE databases SET updated_at = ?, revision = revision + 1
       WHERE id = ? AND user_id = ?
       AND EXISTS (
         SELECT 1 FROM database_cells
         WHERE row_id = ? AND property_id = ? AND last_mutation_id = ?
       )`,
    )
    .bind(timestamp, databaseId, userId, rowId, propertyId, mutationId)
}
