export type HLC = {
  adjusted_ms: number
  counter: number
  device_id: string
}

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

export type LocalNote = {
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

export type OutboxEntry = {
  mutation_id: string
  device_id: string
  entity_type: EntityType
  entity_id: string
  kind: MutationKind
  base_revision: number
  clock: HLC
  changes: Record<string, unknown>
  status: 'pending' | 'sending'
  created_at: number
}

export type SyncMeta = {
  key: 'meta'
  cursor: number
  server_time_offset: number
  last_sync_at: number | null
  bootstrap_complete: boolean
  device_id: string
}

export type LocalAsset = {
  id: string
  blob: Blob
  content_hash: string | null
  uploaded: boolean
  created_at: number
  uploaded_at?: number
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline_pending'
  | 'auth_required'
  | 'error'
  | 'bootstrap'

export type LocalDatabaseRow = {
  id: string
  sort_order: number
  revision: number
  cells: Record<string, string>
  cell_revisions: Record<string, number>
  cell_clocks: Record<string, HLC | null>
}

export type LocalDatabase = {
  id: string
  note_id: string | null
  title: string
  revision: number
  updated_at: number
  created_at: number
  title_clock: HLC | null
  properties: Array<{ id: string; name: string; type: string; sort_order: number }>
  rows: LocalDatabaseRow[]
}

export type BootstrapSnapshot = {
  notes: LocalNote[]
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
