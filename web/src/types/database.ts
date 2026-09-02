export type DatabaseProperty = {
  id: string
  name: string
  type: string
  sort_order: number
}

export type DatabaseRow = {
  id: string
  sort_order: number
  cells: Record<string, string>
}

export type Database = {
  id: string
  note_id: string | null
  title: string
  properties: DatabaseProperty[]
  rows: DatabaseRow[]
  updated_at: number
}

export type DatabaseListItem = {
  id: string
  note_id: string | null
  title: string
  updated_at: number
}
