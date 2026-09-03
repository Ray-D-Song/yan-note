import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { sortOrderToPositionKey } from '../../shared/position-key.ts'
import migrations from '../../test/d1-migrations.json'

function migrationQueries(name: string): string[] {
  const migration = migrations.find((entry) => entry.name === name)
  if (!migration) {
    throw new Error(`Migration not found: ${name}`)
  }
  return migration.queries
}

async function runMigration0012() {
  for (const statement of migrationQueries('0012_notes_parent_set_null.sql')) {
    await env.DB.prepare(statement).run()
  }
}

async function runMigration0013Repair() {
  for (const statement of migrationQueries('0013_position_key_repair.sql')) {
    await env.DB.prepare(statement).run()
  }
}

describe('migrations', () => {
  it('0012 preserves note parent links and databases.note_id across table rebuild', async () => {
    const parentId = crypto.randomUUID()
    const childId = crypto.randomUUID()
    const databaseId = crypto.randomUUID()
    const userId = 'migration-0012-integration'
    const now = Date.now()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, 'migration-0012@test.com', 'hash', now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Parent', '', 0, 'a0', 1, ?, ?)`,
    )
      .bind(parentId, userId, now, now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, ?, 'Child', '', 0, 'a0', 1, ?, ?)`,
    )
      .bind(childId, userId, parentId, now, now)
      .run()

    await env.DB.prepare(
      `INSERT INTO databases (id, user_id, note_id, title, created_at, updated_at)
       VALUES (?, ?, ?, 'DB', ?, ?)`,
    )
      .bind(databaseId, userId, parentId, now, now)
      .run()

    await runMigration0012()

    const child = await env.DB.prepare('SELECT parent_id FROM notes WHERE id = ?')
      .bind(childId)
      .first<{ parent_id: string | null }>()
    expect(child?.parent_id).toBe(parentId)

    const database = await env.DB.prepare('SELECT note_id FROM databases WHERE id = ?')
      .bind(databaseId)
      .first<{ note_id: string | null }>()
    expect(database?.note_id).toBe(parentId)

    const fkCheck = await env.DB.prepare('PRAGMA foreign_key_check').all()
    expect(fkCheck.results?.length ?? 0).toBe(0)
  })

  it('0012 recreates notes indexes used by list queries', async () => {
    const indexes = await env.DB.prepare(`PRAGMA index_list('notes')`).all<{ name: string }>()
    const names = new Set((indexes.results ?? []).map((row) => row.name))
    expect(names.has('idx_notes_user_parent')).toBe(true)
    expect(names.has('idx_notes_user_updated')).toBe(true)
    expect(names.has('idx_notes_user_deleted')).toBe(true)
    expect(names.has('idx_notes_user_position')).toBe(true)
  })

  it('0013 repairs legacy a10 but preserves dynamic a0V and negative keys', async () => {
    const userId = 'migration-0013-position'
    const now = Date.now()
    const legacyId = crypto.randomUUID()
    const dynamicId = crypto.randomUUID()
    const negativeId = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, 'migration-0013@test.com', 'hash', now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Legacy', '', 10, 'a10', 1, ?, ?)`,
    )
      .bind(legacyId, userId, now, now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Dynamic', '', 0, 'a0V', 1, ?, ?)`,
    )
      .bind(dynamicId, userId, now, now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Negative', '', 0, 'Zz', 1, ?, ?)`,
    )
      .bind(negativeId, userId, now, now)
      .run()

    await runMigration0013Repair()

    const legacy = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(legacyId)
      .first<{ position_key: string }>()
    expect(legacy?.position_key).toBe(sortOrderToPositionKey(10))

    const dynamic = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(dynamicId)
      .first<{ position_key: string }>()
    expect(dynamic?.position_key).toBe('a0V')

    const negative = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(negativeId)
      .first<{ position_key: string }>()
    expect(negative?.position_key).toBe('Zz')
  })

  it('0013 does not rewrite dynamic keys that share sort_order with legacy rows', async () => {
    const userId = 'migration-0013-collision'
    const now = Date.now()
    const legacyId = crypto.randomUUID()
    const dynamicId = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, 'migration-0013-collision@test.com', 'hash', now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Legacy', '', 10, 'a10', 1, ?, ?)`,
    )
      .bind(legacyId, userId, now, now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Dynamic', '', 10, 'a0V', 1, ?, ?)`,
    )
      .bind(dynamicId, userId, now, now)
      .run()

    await runMigration0013Repair()

    const legacy = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(legacyId)
      .first<{ position_key: string }>()
    const dynamic = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(dynamicId)
      .first<{ position_key: string }>()

    expect(legacy?.position_key).toBe(sortOrderToPositionKey(10))
    expect(dynamic?.position_key).toBe('a0V')
    expect(legacy?.position_key).not.toBe(dynamic?.position_key)
  })

  it('0013 repair predicate only matches legacy a || sort_order form', () => {
    const update = migrationQueries('0013_position_key_repair.sql').find((statement) =>
      statement.startsWith('UPDATE notes'),
    )
    expect(update).toContain("position_key = 'a' || sort_order")
    expect(update).not.toContain('GLOB')
  })

  it('0014 repairs overflow legacy a1000 keys', async () => {
    const userId = 'migration-0014-overflow'
    const noteId = crypto.randomUUID()
    const now = Date.now()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, 'migration-0014@test.com', 'hash', now)
      .run()

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, position_key, revision, created_at, updated_at)
       VALUES (?, ?, NULL, 'Overflow', '', 1000, 'a1000', 1, ?, ?)`,
    )
      .bind(noteId, userId, now, now)
      .run()

    for (const statement of migrationQueries('0014_position_key_overflow_repair.sql')) {
      await env.DB.prepare(statement).run()
    }

    const note = await env.DB.prepare('SELECT position_key FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ position_key: string }>()
    expect(note?.position_key).toBe(sortOrderToPositionKey(1000))
    expect(note?.position_key).not.toBe('a1000')
  })
})
