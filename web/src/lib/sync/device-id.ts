const DEVICE_ID_KEY = 'yan-note:device-id'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function dbNameForUser(userId: string): string {
  return `yan-note-${userId}`
}

const LAST_USER_KEY = 'yan-note:last-user-id'

export function getLastUserId(): string | null {
  return localStorage.getItem(LAST_USER_KEY)
}

export function setLastUserId(userId: string) {
  localStorage.setItem(LAST_USER_KEY, userId)
}

export function clearLastUserId() {
  localStorage.removeItem(LAST_USER_KEY)
}
