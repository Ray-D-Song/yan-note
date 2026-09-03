export interface User {
  id: string
  email: string
}

export interface NoteListItem {
  id: string
  parent_id: string | null
  title: string
  icon: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export interface Note extends NoteListItem {
  user_id: string
  content: string
}

export interface NoteTreeNode extends NoteListItem {
  children: NoteTreeNode[]
}

export interface NoteReorderUpdate {
  parent_id: string | null
  ordered_ids: string[]
}

export function compareNotes(a: NoteListItem, b: NoteListItem): number {
  if (a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order
  }
  return a.created_at - b.created_at
}

function sortTreeNodes(nodes: NoteTreeNode[]): NoteTreeNode[] {
  return nodes
    .slice()
    .sort(compareNotes)
    .map((node) => ({
      ...node,
      children: sortTreeNodes(node.children),
    }))
}

export function buildNoteTree(notes: NoteListItem[]): NoteTreeNode[] {
  const map = new Map<string, NoteTreeNode>()
  const roots: NoteTreeNode[] = []

  for (const note of notes) {
    map.set(note.id, { ...note, children: [] })
  }

  for (const note of notes) {
    const node = map.get(note.id)
    if (!node) {
      continue
    }
    if (note.parent_id && map.has(note.parent_id)) {
      map.get(note.parent_id)?.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return sortTreeNodes(roots)
}

export function getNoteBreadcrumbs(
  notes: NoteListItem[],
  noteId: string,
): NoteListItem[] {
  const map = new Map(notes.map((note) => [note.id, note]))
  const crumbs: NoteListItem[] = []
  let current = map.get(noteId)

  while (current) {
    crumbs.unshift(current)
    current = current.parent_id ? map.get(current.parent_id) : undefined
  }

  return crumbs
}

export function isDescendantOfNote(
  notes: NoteListItem[],
  ancestorId: string,
  nodeId: string,
): boolean {
  const parentById = new Map(notes.map((note) => [note.id, note.parent_id]))
  let current: string | null | undefined = nodeId

  while (current) {
    if (current === ancestorId) {
      return true
    }
    current = parentById.get(current) ?? null
  }

  return false
}
