const ITERATIONS = 100_000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  )
  return new Uint8Array(derivedBits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const hash = await deriveKey(password, salt)
  return `${toBase64(salt)}:${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) {
    return false
  }
  const salt = fromBase64(saltB64)
  const expectedHash = fromBase64(hashB64)
  const actualHash = await deriveKey(password, salt)
  if (actualHash.length !== expectedHash.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < actualHash.length; i++) {
    diff |= (actualHash[i] ?? 0) ^ (expectedHash[i] ?? 0)
  }
  return diff === 0
}
