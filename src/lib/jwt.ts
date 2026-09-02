import { sign, verify } from 'hono/jwt'

export type JwtPayload = {
  sub: string
  email: string
  exp: number
}

const COOKIE_NAME = 'token'
const MAX_AGE = 60 * 60 * 24 * 7

function parseExpiresIn(value: string): number {
  const match = /^(\d+)([dhms])$/.exec(value)
  if (!match) {
    return MAX_AGE
  }
  const amount = Number(match[1])
  const unit = match[2]
  switch (unit) {
    case 'd':
      return amount * 60 * 60 * 24
    case 'h':
      return amount * 60 * 60
    case 'm':
      return amount * 60
    case 's':
      return amount
    default:
      return MAX_AGE
  }
}

export async function createToken(
  userId: string,
  email: string,
  secret: string,
  expiresIn = '7d',
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + parseExpiresIn(expiresIn)
  return sign({ sub: userId, email, exp }, secret)
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const payload = await verify(token, secret, 'HS256')
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    return { sub: payload.sub, email: payload.email, exp: payload.exp }
  } catch {
    return null
  }
}

export function setAuthCookie(c: { header: (name: string, value: string) => void }, token: string) {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`,
  )
}

export function clearAuthCookie(c: { header: (name: string, value: string) => void }) {
  c.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
}

export function getTokenFromCookie(cookieHeader: string | undefined): string | null {
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
