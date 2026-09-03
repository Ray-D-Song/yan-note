import type { HLC } from './hlc'

export type EntityType = 'note' | 'database' | 'database_row' | 'database_cell'

export type MutationKind =
  | 'create'
  | 'patch'
  | 'move'
  | 'soft_delete'
  | 'restore'
  | 'purge'

export type Mutation = {
  mutation_id: string
  device_id: string
  entity_type: EntityType
  entity_id: string
  kind: MutationKind
  base_revision: number
  clock: HLC
  changes: Record<string, unknown>
}

export type MutationResult = 'applied' | 'superseded' | 'rejected'

export type MutationAck = {
  mutation_id: string
  result: MutationResult
  reason?: string
  entity?: Record<string, unknown>
}

export type SyncChange = {
  seq: number
  entity_type: EntityType
  entity_id: string
  revision: number
  operation: string
  payload: Record<string, unknown>
  created_at: number
}

export type NoteSnapshot = {
  id: string
  parent_id: string | null
  title: string
  content: string
  icon: string | null
  position_key: string
  revision: number
  created_at: number
  updated_at: number
  deleted_at: number | null
  title_clock: HLC | null
  content_clock: HLC | null
  icon_clock: HLC | null
  parent_clock: HLC | null
  position_clock: HLC | null
}

export type BootstrapSnapshot = {
  notes: NoteSnapshot[]
  databases: Array<Record<string, unknown>>
  cursor: number
  server_time: number
}

export type SyncResponse = {
  acks: MutationAck[]
  changes: SyncChange[]
  cursor: number
  server_time: number
  has_more: boolean
  error?: string
}

export const MAX_MUTATIONS_PER_REQUEST = 100
export const MAX_CHANGES_PER_RESPONSE = 500
export const CHANGE_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
export const NOTE_VERSION_MAX_COUNT = 100
export const NOTE_VERSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
