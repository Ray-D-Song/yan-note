import { env } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import { applyMutations } from './sync-db'
import type { Mutation } from './sync-types'

function makeMutation(overrides: Partial<Mutation> & Pick<Mutation, 'mutation_id' | 'entity_id' | 'kind'>): Mutation {
  return {
    device_id: 'test-device',
    entity_type: 'note',
    base_revision: 0,
    clock: { adjusted_ms: Date.now(), counter: 0, device_id: 'test-device' },
    changes: {},
    ...overrides,
  }
}

describe('sync-db integration', () => {
  const userId = 'user-sync-test'

  beforeAll(async () => {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(userId, 'sync@test.com', 'hash', Date.now()).run()
  })

  it('applies create note mutation idempotently', async () => {
    const noteId = crypto.randomUUID()
    const mutation = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'create',
      changes: { title: 'Sync Test', content: 'Hello', parent_id: null, position_key: 'a0' },
    })

    const first = await applyMutations(env.DB, userId, [mutation])
    expect(first.acks[0]?.result).toBe('applied')

    const second = await applyMutations(env.DB, userId, [mutation])
    expect(second.acks[0]?.result).toBe('applied')

    const note = await env.DB.prepare('SELECT title, content FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ title: string; content: string }>()
    expect(note?.title).toBe('Sync Test')
    expect(note?.content).toBe('Hello')
  })

  it('resolves same-field LWW by clock', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Original', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const early = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      clock: { adjusted_ms: 1000, counter: 0, device_id: 'a' },
      changes: {
        title: 'Early',
        title_clock: { adjusted_ms: 1000, counter: 0, device_id: 'a' },
      },
    })
    const late = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      clock: { adjusted_ms: 2000, counter: 0, device_id: 'b' },
      changes: {
        title: 'Late Winner',
        title_clock: { adjusted_ms: 2000, counter: 0, device_id: 'b' },
      },
    })

    await applyMutations(env.DB, userId, [late, early])
    const note = await env.DB.prepare('SELECT title FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ title: string }>()
    expect(note?.title).toBe('Late Winner')
  })

  it('creates database and row via sync mutations', async () => {
    const databaseId = crypto.randomUUID()
    const rowId = crypto.randomUUID()

    const createDb = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_type: 'database',
      entity_id: databaseId,
      kind: 'create',
      changes: { title: 'Table', note_id: null },
    })
    const dbResult = await applyMutations(env.DB, userId, [createDb])
    expect(dbResult.acks[0]?.result).toBe('applied')

    const createRow = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_type: 'database_row',
      entity_id: rowId,
      kind: 'create',
      changes: { database_id: databaseId, sort_order: 0 },
    })
    const rowResult = await applyMutations(env.DB, userId, [createRow])
    expect(rowResult.acks[0]?.result).toBe('applied')

    const row = await env.DB.prepare('SELECT id FROM database_rows WHERE id = ?').bind(rowId).first()
    expect(row).toBeTruthy()
  })

  it('rejects cross-account database cell patch', async () => {
    const otherUser = 'user-other'
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(otherUser, 'other@test.com', 'hash', Date.now()).run()

    const databaseId = crypto.randomUUID()
    await applyMutations(env.DB, otherUser, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_type: 'database',
        entity_id: databaseId,
        kind: 'create',
        changes: { title: 'Private', note_id: null },
      }),
    ])

    const rowId = crypto.randomUUID()
    await applyMutations(env.DB, otherUser, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_type: 'database_row',
        entity_id: rowId,
        kind: 'create',
        changes: { database_id: databaseId, sort_order: 0 },
      }),
    ])

    const propertyId = `${databaseId}-title`
    const cellKey = `${rowId}:${propertyId}`
    const attack = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_type: 'database_cell',
      entity_id: cellKey,
      kind: 'patch',
      changes: {
        row_id: rowId,
        property_id: propertyId,
        value: 'hacked',
        database_id: databaseId,
      },
    })

    const result = await applyMutations(env.DB, userId, [attack])
    expect(result.acks[0]?.result).toBe('rejected')

    const cell = await env.DB.prepare(
      'SELECT value FROM database_cells WHERE row_id = ? AND property_id = ?',
    ).bind(rowId, propertyId).first<{ value: string }>()
    expect(cell?.value).not.toBe('hacked')
  })

  it('bootstrap cursor precedes snapshot reads', async () => {
    const { getBootstrapSnapshot } = await import('./sync-db')
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        changes: { title: 'Bootstrap Note', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const snapshot = await getBootstrapSnapshot(env.DB, userId)
    expect(snapshot.notes.some((n) => n.id === noteId)).toBe(true)
    expect(snapshot.cursor).toBeGreaterThan(0)
  })

  it('resolves concurrent patch with CAS', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Base', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const m1 = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
      changes: {
        title: 'Winner',
        title_clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
      },
    })
    const m2 = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
      changes: {
        title: 'Loser',
        title_clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
      },
    })

    await Promise.all([
      applyMutations(env.DB, userId, [m1]),
      applyMutations(env.DB, userId, [m2]),
    ])

    const note = await env.DB.prepare('SELECT title FROM notes WHERE id = ?').bind(noteId).first<{ title: string }>()
    expect(note?.title).toBe('Winner')
  })

  it('rejects patch that changes parent_id', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        changes: { title: 'Root', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const otherId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: otherId,
        kind: 'create',
        changes: { title: 'Other', content: '', parent_id: null, position_key: 'a1' },
      }),
    ])

    const patch = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      changes: {
        parent_id: otherId,
        parent_clock: { adjusted_ms: 5000, counter: 0, device_id: 'x' },
      },
    })

    const result = await applyMutations(env.DB, userId, [patch])
    expect(result.acks[0]?.result).toBe('rejected')

    const note = await env.DB.prepare('SELECT parent_id FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ parent_id: string | null }>()
    expect(note?.parent_id).toBeNull()
  })

  it('writes sync change atomically with note patch', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Before', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const patch = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'patch',
      base_revision: 1,
      clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
      changes: {
        title: 'After',
        title_clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
      },
    })

    await applyMutations(env.DB, userId, [patch])

    const change = await env.DB.prepare(
      `SELECT operation, payload FROM sync_changes WHERE entity_id = ? AND operation = 'patch' ORDER BY seq DESC LIMIT 1`,
    ).bind(noteId).first<{ operation: string; payload: string }>()

    expect(change?.operation).toBe('patch')
    expect(JSON.parse(change?.payload ?? '{}').title).toBe('After')
  })

  it('does not write change log when CAS update affects zero rows', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Rev1', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'patch',
        base_revision: 1,
        clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        changes: {
          title: 'Rev2',
          title_clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        },
      }),
    ])

    const loserResult = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'patch',
        base_revision: 1,
        clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
        changes: {
          title: 'Stale',
          title_clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
        },
      }),
    ])
    expect(loserResult.acks[0]?.result).toBe('superseded')

    const staleChange = await env.DB.prepare(
      `SELECT payload FROM sync_changes WHERE entity_id = ? AND payload LIKE ?`,
    ).bind(noteId, '%Stale%').first()
    expect(staleChange).toBeNull()

    const note = await env.DB.prepare('SELECT title FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ title: string }>()
    expect(note?.title).toBe('Rev2')
  })

  it('soft_delete uses CAS and rejects stale base_revision at commit time', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Delete me', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const patchResult = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'patch',
        base_revision: 1,
        clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        changes: {
          title: 'Updated',
          title_clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        },
      }),
    ])
    expect(patchResult.acks[0]?.result).toBe('applied')

    const beforeDelete = await env.DB.prepare('SELECT revision FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ revision: number }>()
    expect(beforeDelete?.revision).toBe(2)

    const staleDelete = makeMutation({
      mutation_id: crypto.randomUUID(),
      entity_id: noteId,
      kind: 'soft_delete',
      base_revision: 1,
      changes: {},
    })
    const result = await applyMutations(env.DB, userId, [staleDelete])
    expect(result.acks[0]?.result).toBe('superseded')

    const note = await env.DB.prepare('SELECT deleted_at, title FROM notes WHERE id = ?')
      .bind(noteId)
      .first<{ deleted_at: number | null; title: string }>()
    expect(note?.deleted_at).toBeNull()
    expect(note?.title).toBe('Updated')
  })

  it('purge does not delete descendant restored before batch commits', async () => {
    const rootId = crypto.randomUUID()
    const childId = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Root', content: '', parent_id: null, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'create',
        clock: { adjusted_ms: 110, counter: 0, device_id: 'test-device' },
        changes: { title: 'Child', content: '', parent_id: rootId, position_key: 'a0' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'restore',
        base_revision: 2,
        clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    const rootBeforePurge = await env.DB.prepare(
      'SELECT id, user_id, deleted_at FROM notes WHERE id = ?',
    )
      .bind(rootId)
      .first<{ id: string; user_id: string; deleted_at: number | null }>()
    expect(rootBeforePurge?.id).toBe(rootId)
    expect(rootBeforePurge?.user_id).toBe(userId)
    expect(rootBeforePurge?.deleted_at).not.toBeNull()

    const purgeResult = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'purge',
        base_revision: 2,
        clock: { adjusted_ms: 400, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])
    expect(purgeResult.acks[0]?.result).toBe('applied')

    const child = await env.DB.prepare('SELECT id, deleted_at, parent_id FROM notes WHERE id = ?')
      .bind(childId)
      .first<{ id: string; deleted_at: number | null; parent_id: string | null }>()
    expect(child).not.toBeNull()
    expect(child?.deleted_at).toBeNull()

    const root = await env.DB.prepare('SELECT id FROM notes WHERE id = ?').bind(rootId).first()
    expect(root).toBeNull()
  })

  it('rejects move that would create a cycle after prior move', async () => {
    const noteA = crypto.randomUUID()
    const noteB = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteA,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'A', content: '', parent_id: null, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteB,
        kind: 'create',
        clock: { adjusted_ms: 110, counter: 0, device_id: 'test-device' },
        changes: { title: 'B', content: '', parent_id: null, position_key: 'a1' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteA,
        kind: 'move',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {
          parent_id: noteB,
          position_key: 'a0',
          parent_clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
          position_clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        },
      }),
    ])

    const cycle = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteB,
        kind: 'move',
        base_revision: 1,
        clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
        changes: {
          parent_id: noteA,
          position_key: 'a0',
          parent_clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
          position_clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
        },
      }),
    ])
    expect(cycle.acks[0]?.result).toBe('rejected')
    expect(cycle.acks[0]?.reason).toMatch(/Circular/i)
  })

  it('does not create note version when CAS patch loses', async () => {
    const noteId = crypto.randomUUID()
    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Rev1', content: 'v1', parent_id: null, position_key: 'a0' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'patch',
        base_revision: 1,
        clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        changes: {
          content: 'v2',
          content_clock: { adjusted_ms: 2000, counter: 0, device_id: 'a' },
        },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'patch',
        base_revision: 1,
        clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
        changes: {
          content: 'stale',
          content_clock: { adjusted_ms: 1000, counter: 0, device_id: 'b' },
        },
      }),
    ])

    const versions = await env.DB.prepare(
      'SELECT snapshot FROM note_versions WHERE note_id = ?',
    ).bind(noteId).all<{ snapshot: string }>()

    expect(versions.results?.length ?? 0).toBe(1)
    expect(JSON.parse(versions.results![0]!.snapshot).content).toBe('v1')
  })

  it('leaf soft delete returns applied on first attempt', async () => {
    const noteId = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: noteId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Leaf', content: '', parent_id: null, position_key: 'a0' },
      }),
    ])

    const mutationId = crypto.randomUUID()
    const result = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: mutationId,
        entity_id: noteId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    expect(result.acks[0]?.result).toBe('applied')

    const replay = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: mutationId,
        entity_id: noteId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])
    expect(replay.acks[0]?.result).toBe('applied')
  })

  it('soft_delete change carries per-node revisions for descendants', async () => {
    const parentId = crypto.randomUUID()
    const childId = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: parentId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Parent', content: '', parent_id: null, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'create',
        clock: { adjusted_ms: 110, counter: 0, device_id: 'test-device' },
        changes: { title: 'Child', content: '', parent_id: parentId, position_key: 'a0' },
      }),
    ])

    for (let i = 0; i < 7; i++) {
      await applyMutations(env.DB, userId, [
        makeMutation({
          mutation_id: crypto.randomUUID(),
          entity_id: childId,
          kind: 'patch',
          base_revision: i + 1,
          clock: { adjusted_ms: 200 + i, counter: 0, device_id: 'test-device' },
          changes: {
            title: `Child v${i + 2}`,
            title_clock: { adjusted_ms: 200 + i, counter: 0, device_id: 'test-device' },
          },
        }),
      ])
    }

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: parentId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 500, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    const changes = await env.DB.prepare(
      `SELECT entity_id, revision, payload FROM sync_changes
       WHERE operation = 'soft_delete' AND entity_id IN (?, ?)
       ORDER BY entity_id`,
    )
      .bind(parentId, childId)
      .all<{ entity_id: string; revision: number; payload: string }>()

    expect(changes.results?.length).toBe(2)
    const byId = new Map((changes.results ?? []).map((row) => [row.entity_id, row]))
    expect(byId.get(parentId)?.revision).toBe(2)
    expect(byId.get(childId)?.revision).toBe(9)
    expect(JSON.parse(byId.get(parentId)?.payload ?? '{}')).toEqual({})
    expect(JSON.parse(byId.get(childId)?.payload ?? '{}')).toEqual({})

    for (const row of changes.results ?? []) {
      const note = await env.DB.prepare('SELECT revision FROM notes WHERE id = ?')
        .bind(row.entity_id)
        .first<{ revision: number }>()
      expect(note?.revision).toBe(row.revision)
    }

    const child = await env.DB.prepare('SELECT revision, deleted_at FROM notes WHERE id = ?')
      .bind(childId)
      .first<{ revision: number; deleted_at: number | null }>()
    expect(child?.revision).toBe(9)
    expect(child?.deleted_at).not.toBeNull()
  })

  it('purge keeps restored descendant even after child revision bump', async () => {
    const rootId = crypto.randomUUID()
    const childId = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Root', content: '', parent_id: null, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'create',
        clock: { adjusted_ms: 110, counter: 0, device_id: 'test-device' },
        changes: { title: 'Child', content: '', parent_id: rootId, position_key: 'a0' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'restore',
        base_revision: 2,
        clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'patch',
        base_revision: 3,
        clock: { adjusted_ms: 350, counter: 0, device_id: 'test-device' },
        changes: {
          title: 'Edited after restore',
          title_clock: { adjusted_ms: 350, counter: 0, device_id: 'test-device' },
        },
      }),
    ])

    const oldParentClock = {
      adjusted_ms: Date.now() + 4 * 60 * 1000,
      counter: 50,
      device_id: 'client-device',
    }
    await env.DB.prepare('UPDATE notes SET parent_clock = ? WHERE id = ?')
      .bind(JSON.stringify(oldParentClock), childId)
      .run()

    const purgeResult = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'purge',
        base_revision: 2,
        clock: { adjusted_ms: 400, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])
    expect(purgeResult.acks[0]?.result).toBe('applied')

    const child = await env.DB.prepare('SELECT id, deleted_at, parent_id, revision, parent_clock FROM notes WHERE id = ?')
      .bind(childId)
      .first<{
        id: string
        deleted_at: number | null
        parent_id: string | null
        revision: number
        parent_clock: string | null
      }>()
    expect(child).not.toBeNull()
    expect(child?.deleted_at).toBeNull()
    expect(child?.parent_id).toBeNull()
    expect(child?.revision).toBe(5)
    expect(child?.parent_clock).toBeNull()

    const moveChange = await env.DB.prepare(
      'SELECT payload FROM sync_changes WHERE entity_id = ? AND operation = ? ORDER BY seq DESC LIMIT 1',
    )
      .bind(childId, 'move')
      .first<{ payload: string }>()
    const movePayload = JSON.parse(moveChange?.payload ?? '{}') as {
      parent_id: string | null
      authoritative?: number
    }
    expect(movePayload.parent_id).toBeNull()
    expect(movePayload.authoritative).toBeTruthy()

    const root = await env.DB.prepare('SELECT id FROM notes WHERE id = ?').bind(rootId).first()
    expect(root).toBeNull()
  })

  it('move succeeds immediately after purge reparent', async () => {
    const rootId = crypto.randomUUID()
    const childId = crypto.randomUUID()
    const newParentId = crypto.randomUUID()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'create',
        clock: { adjusted_ms: 100, counter: 0, device_id: 'test-device' },
        changes: { title: 'Root', content: '', parent_id: null, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'create',
        clock: { adjusted_ms: 110, counter: 0, device_id: 'test-device' },
        changes: { title: 'Child', content: '', parent_id: rootId, position_key: 'a0' },
      }),
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: newParentId,
        kind: 'create',
        clock: { adjusted_ms: 120, counter: 0, device_id: 'test-device' },
        changes: { title: 'New parent', content: '', parent_id: null, position_key: 'a1' },
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'soft_delete',
        base_revision: 1,
        clock: { adjusted_ms: 200, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'restore',
        base_revision: 2,
        clock: { adjusted_ms: 300, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    const aheadParentClock = {
      adjusted_ms: Date.now() + 4 * 60 * 1000,
      counter: 50,
      device_id: 'client-device',
    }
    await env.DB.prepare('UPDATE notes SET parent_clock = ? WHERE id = ?')
      .bind(JSON.stringify(aheadParentClock), childId)
      .run()

    await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: rootId,
        kind: 'purge',
        base_revision: 2,
        clock: { adjusted_ms: 400, counter: 0, device_id: 'test-device' },
        changes: {},
      }),
    ])

    const moveResult = await applyMutations(env.DB, userId, [
      makeMutation({
        mutation_id: crypto.randomUUID(),
        entity_id: childId,
        kind: 'move',
        base_revision: 4,
        clock: { adjusted_ms: 500, counter: 0, device_id: 'test-device' },
        changes: {
          parent_id: newParentId,
          position_key: 'a0',
          parent_clock: { adjusted_ms: 500, counter: 0, device_id: 'test-device' },
          position_clock: { adjusted_ms: 500, counter: 0, device_id: 'test-device' },
        },
      }),
    ])
    expect(moveResult.acks[0]?.result).toBe('applied')

    const child = await env.DB.prepare('SELECT parent_id FROM notes WHERE id = ?')
      .bind(childId)
      .first<{ parent_id: string | null }>()
    expect(child?.parent_id).toBe(newParentId)
  })
})
