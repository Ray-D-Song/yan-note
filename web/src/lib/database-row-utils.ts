import { parseHLC, type HLC } from '../../../shared/hlc'
import type { LocalDatabaseRow } from '@/lib/sync/types'

function parseMaybeHLC(raw: unknown): HLC | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') return parseHLC(raw)
  if (typeof raw === 'object' && raw !== null && 'adjusted_ms' in raw) {
    return raw as HLC
  }
  return null
}

export function parseDatabaseRow(raw: Record<string, unknown>): LocalDatabaseRow {
  const cellsRaw = (raw.cells as Record<string, unknown>) ?? {}
  const cells: Record<string, string> = {}
  const cell_revisions: Record<string, number> = {}
  const cell_clocks: Record<string, HLC | null> = {}

  for (const [key, val] of Object.entries(cellsRaw)) {
    if (val && typeof val === 'object' && 'value' in val) {
      const cell = val as { value: string; revision?: number; value_clock?: unknown }
      cells[key] = cell.value
      cell_revisions[key] = cell.revision ?? 1
      cell_clocks[key] = parseMaybeHLC(cell.value_clock)
    } else {
      cells[key] = val as string
      cell_revisions[key] = 1
      cell_clocks[key] = null
    }
  }

  return {
    id: raw.id as string,
    sort_order: (raw.sort_order as number) ?? 0,
    revision: (raw.revision as number) ?? 1,
    cells,
    cell_revisions,
    cell_clocks,
  }
}

export function emptyCellMaps(propertyIds: string[]) {
  const cell_revisions: Record<string, number> = {}
  const cell_clocks: Record<string, HLC | null> = {}
  for (const id of propertyIds) {
    cell_revisions[id] = 1
    cell_clocks[id] = null
  }
  return { cell_revisions, cell_clocks }
}

export function parseMaybeHLCField(raw: unknown): HLC | null {
  return parseMaybeHLC(raw)
}
