import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkMigrationPreconditions } from './lib/migration-preconditions.ts'
import migrations from '../test/d1-migrations.json'

async function runOnDb(sql: string): Promise<unknown[]> {
  if (sql.includes('sqlite_master')) {
    return (await env.DB.prepare(sql).all()).results ?? []
  }
  if (sql.startsWith('PRAGMA table_info')) {
    return (await env.DB.prepare(sql).all()).results ?? []
  }
  return (await env.DB.prepare(sql).all()).results ?? []
}

describe('checkMigrationPreconditions', () => {
  it('passes when notes table is missing', async () => {
    const outcome = await checkMigrationPreconditions(async (sql) => {
      if (sql.includes('sqlite_master')) {
        return [{ count: 0 }]
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    expect(outcome).toEqual({ ok: true, schema: 'missing' })
  })

  it('passes for pre-position_key schema without overflow sort_order', async () => {
    const outcome = await checkMigrationPreconditions(async (sql) => {
      if (sql.includes('sqlite_master')) {
        return [{ count: 1 }]
      }
      if (sql.startsWith('PRAGMA table_info')) {
        return [{ name: 'id' }, { name: 'sort_order' }]
      }
      if (sql.includes('sort_order >')) {
        return [{ count: 0 }]
      }
      throw new Error(`unexpected query: ${sql}`)
    })

    expect(outcome).toEqual({ ok: true, schema: 'pre_position_key' })
  })

  it('fails for pre-position_key schema with overflow sort_order', async () => {
    const outcome = await checkMigrationPreconditions(async (sql) => {
      if (sql.includes('sqlite_master')) {
        return [{ count: 1 }]
      }
      if (sql.startsWith('PRAGMA table_info')) {
        return [{ name: 'sort_order' }]
      }
      return [{ count: 2 }]
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.schema).toBe('pre_position_key')
      expect(outcome.message).toContain('sort_order > 1999')
    }
  })

  it('uses legacy position_key predicate when column exists', async () => {
    const queries: string[] = []
    const outcome = await checkMigrationPreconditions(async (sql) => {
      queries.push(sql)
      if (sql.includes('sqlite_master')) {
        return [{ count: 1 }]
      }
      if (sql.startsWith('PRAGMA table_info')) {
        return [{ name: 'sort_order' }, { name: 'position_key' }]
      }
      return [{ count: 0 }]
    })

    expect(outcome).toEqual({ ok: true, schema: 'with_position_key' })
    expect(queries.some((sql) => sql.includes("position_key = 'a' || sort_order"))).toBe(true)
    expect(queries.some((sql) => sql.includes('PRAGMA table_info(notes)'))).toBe(true)
  })
})

describe('checkMigrationPreconditions on D1', () => {
  it('passes on an empty database', async () => {
    const outcome = await checkMigrationPreconditions(runOnDb)
    expect(outcome.ok).toBe(true)
    expect(outcome.schema).toBe('missing')
  })
})

describe('checkMigrationPreconditions on 0004 schema', () => {
  beforeAll(async () => {
    for (const migration of migrations) {
      if (migration.name > '0004_note_soft_delete.sql') {
        break
      }
      for (const query of migration.queries) {
        await env.DB.prepare(query).run()
      }
    }
  })

  it('passes without querying position_key', async () => {
    const userId = 'precheck-0004'
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, 'precheck@test.com', 'hash', now)
      .run()
    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, parent_id, title, content, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, NULL, 'Note', '', 10, ?, ?, NULL)`,
    )
      .bind(crypto.randomUUID(), userId, now, now)
      .run()

    const queries: string[] = []
    const outcome = await checkMigrationPreconditions(async (sql) => {
      queries.push(sql)
      return runOnDb(sql)
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.schema).toBe('pre_position_key')
    expect(queries.some((sql) => sql.includes('position_key'))).toBe(false)
  })
})
