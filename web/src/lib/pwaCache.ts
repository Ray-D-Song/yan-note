export const PWA_NOTE_CACHE_NAMES = ['yan-notes-list', 'yan-note-detail'] as const

export async function clearNoteApiCaches() {
  if (typeof caches === 'undefined') {
    return
  }

  await Promise.all(PWA_NOTE_CACHE_NAMES.map((name) => caches.delete(name)))
}
