import {
  createSessionRecord,
  deleteSessionRecord,
  findSessionWithUser,
  now,
} from './db'

const COOKIE_NAME = 'session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type SessionInfo = {
  userId: string
  email: string
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const id = crypto.randomUUID()
  const timestamp = now()
  await createSessionRecord(db, {
    id,
    user_id: userId,
    expires_at: timestamp + MAX_AGE_SECONDS * 1000,
    created_at: timestamp,
  })
  return id
}

export async function getSession(db: D1Database, token: string): Promise<SessionInfo | null> {
  const row = await findSessionWithUser(db, token)
  if (!row) {
    return null
  }
  if (row.expires_at <= now()) {
    await deleteSessionRecord(db, token)
    return null
  }
  return { userId: row.user_id, email: row.email }
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await deleteSessionRecord(db, token)
}

export function setAuthCookie(c: { header: (name: string, value: string) => void }, token: string) {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`,
  )
}

export function clearAuthCookie(c: { header: (name: string, value: string) => void }) {
  c.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
}

export function getSessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null
  }
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === COOKIE_NAME) {
      return rest.join('=') || null
    }
  }
  return null
}
