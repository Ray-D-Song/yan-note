import { compareHLC, hlcWins, type HLC } from '../../../../shared/hlc'
import type { LocalDatabase, LocalNote, OutboxEntry } from '@/lib/sync/types'

const NOTE_FIELDS = [
  ['title', 'title_clock'],
  ['content', 'content_clock'],
  ['icon', 'icon_clock'],
  ['parent_id', 'parent_clock'],
  ['position_key', 'position_clock'],
] as const

function pendingFieldClock(entry: OutboxEntry, field: string): HLC | null {
  const clockKey = `${field}_clock`
  const fromChanges = entry.changes[clockKey]
  if (fromChanges && typeof fromChanges === 'object') {
    return fromChanges as HLC
  }
  if (field in entry.changes) {
    return entry.clock
  }
  return null
}

function entryTouchesField(entry: OutboxEntry, field: string): boolean {
  return field in entry.changes || `${field}_clock` in entry.changes
}

export function mergeRemoteNote(
  existing: LocalNote,
  payload: Record<string, unknown>,
  revision: number,
  pending: OutboxEntry[],
): LocalNote {
  const merged: LocalNote = { ...existing, revision }

  for (const [field, clockField] of NOTE_FIELDS) {
    if (!(field in payload) && !(clockField in payload)) {
      continue
    }

    if (payload.authoritative && field === 'parent_id') {
      if ('parent_id' in payload) {
        merged.parent_id = payload.parent_id as string | null
      }
      merged.parent_clock = (payload.parent_clock as HLC | null | undefined) ?? null
      continue
    }

    const remoteClock = (payload[clockField] as HLC | undefined) ?? null
    const localClock = existing[clockField]
    const pendingEntries = pending.filter((e) => entryTouchesField(e, field))

    let strongestPending: HLC | null = null
    for (const entry of pendingEntries) {
      const pc = pendingFieldClock(entry, field)
      if (pc && (!strongestPending || compareHLC(pc, strongestPending) > 0)) {
        strongestPending = pc
      }
    }

    if (strongestPending && (!remoteClock || hlcWins(strongestPending, remoteClock))) {
      continue
    }

    if (remoteClock && !hlcWins(remoteClock, localClock)) {
      continue
    }

    if (field in payload) {
      ;(merged as Record<string, unknown>)[field] = payload[field]
    }
    if (remoteClock) {
      ;(merged as Record<string, unknown>)[clockField] = remoteClock
    }
  }

  if (payload.updated_at !== undefined) {
    merged.updated_at = payload.updated_at as number
  }

  return merged
}

export function mergeRemoteDatabaseTitle(
  existing: LocalDatabase,
  payload: Record<string, unknown>,
  revision: number,
  pending: OutboxEntry[],
): LocalDatabase {
  const merged = { ...existing, revision }
  if (!('title' in payload)) {
    return merged
  }

  const remoteClock = (payload.title_clock as HLC | undefined) ?? null
  const pendingTitle = pending
    .filter((e) => e.entity_type === 'database' && 'title' in e.changes)
    .map((e) => pendingFieldClock(e, 'title'))
    .filter(Boolean) as HLC[]

  const strongestPending = pendingTitle.sort(compareHLC).at(-1) ?? null
  if (strongestPending && (!remoteClock || hlcWins(strongestPending, remoteClock))) {
    return merged
  }
  if (remoteClock && !hlcWins(remoteClock, existing.title_clock)) {
    return merged
  }

  merged.title = payload.title as string
  merged.title_clock = remoteClock
  merged.updated_at = (payload.updated_at as number | undefined) ?? merged.updated_at
  return merged
}

export function mergeRemoteDatabaseCell(
  existing: LocalDatabase,
  payload: Record<string, unknown>,
  cellRevision: number,
  pending: OutboxEntry[],
): LocalDatabase {
  const rowId = payload.row_id as string
  const propertyId = payload.property_id as string
  const row = existing.rows.find((r) => r.id === rowId)
  if (!row) {
    return existing
  }

  const remoteClock = (payload.value_clock as HLC | undefined) ?? null
  const cellKey = `${rowId}:${propertyId}`
  const pendingEntries = pending.filter(
    (e) => e.entity_type === 'database_cell' && e.entity_id === cellKey,
  )
  let strongestPending: HLC | null = null
  for (const entry of pendingEntries) {
    const pc = pendingFieldClock(entry, 'value')
    if (pc && (!strongestPending || compareHLC(pc, strongestPending) > 0)) {
      strongestPending = pc
    }
  }

  if (strongestPending && (!remoteClock || hlcWins(strongestPending, remoteClock))) {
    return existing
  }

  const existingCellClock = row.cell_clocks[propertyId] ?? null
  if (remoteClock && existingCellClock && !hlcWins(remoteClock, existingCellClock)) {
    return existing
  }

  row.cells[propertyId] = payload.value as string
  row.cell_revisions[propertyId] = cellRevision
  if (remoteClock) {
    row.cell_clocks[propertyId] = remoteClock
  }
  return { ...existing, updated_at: Date.now() }
}

const MAX_LINE_DIFF_CELLS = 250_000

function trimCommonAffixes(a: string[], b: string[]) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++
  }
  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--
    endB--
  }
  return {
    prefix: a.slice(0, start),
    suffix: a.slice(endA + 1),
    aMid: a.slice(start, endA + 1),
    bMid: b.slice(start, endB + 1),
  }
}

function lineDiffFallback(
  a: string[],
  b: string[],
): Array<{ type: 'same' | 'add' | 'remove'; line: string }> {
  return [
    ...a.map((line) => ({ type: 'remove' as const, line })),
    ...b.map((line) => ({ type: 'add' as const, line })),
  ]
}

function lineDiffLcs(
  a: string[],
  b: string[],
): Array<{ type: 'same' | 'add' | 'remove'; line: string }> {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const result: Array<{ type: 'same' | 'add' | 'remove'; line: string }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', line: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: 'remove', line: a[i]! })
      i++
    } else {
      result.push({ type: 'add', line: b[j]! })
      j++
    }
  }
  while (i < n) {
    result.push({ type: 'remove', line: a[i++]! })
  }
  while (j < m) {
    result.push({ type: 'add', line: b[j++]! })
  }
  return result
}

export function lineDiff(before: string, after: string): Array<{ type: 'same' | 'add' | 'remove'; line: string }> {
  const a = before.split('\n')
  const b = after.split('\n')
  const { prefix, suffix, aMid, bMid } = trimCommonAffixes(a, b)

  const mid =
    aMid.length * bMid.length > MAX_LINE_DIFF_CELLS
      ? lineDiffFallback(aMid, bMid)
      : lineDiffLcs(aMid, bMid)

  return [
    ...prefix.map((line) => ({ type: 'same' as const, line })),
    ...mid,
    ...suffix.map((line) => ({ type: 'same' as const, line })),
  ]
}
