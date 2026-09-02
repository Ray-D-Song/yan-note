export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const API_V1_BASE = '/api/v1'

function resolveApiPath(path: string): string {
  if (path.startsWith('/api/')) {
    return path
  }
  return `${API_V1_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? response.statusText)
  }
  return data
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })
  return parseJson<T>(response)
}
