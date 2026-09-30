export type ErrorCode =
  | 'RIOT_CLIENT_NOT_RUNNING'
  | 'NOT_CONNECTED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_ACTION'

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class ApiError extends AppError {
  readonly status: number
  /** Riot's own error code, e.g. "RESOURCE_NOT_FOUND". */
  readonly riotCode: string | null
  /** From the Retry-After header on 429 responses. */
  readonly retryAfterMs: number | null

  constructor(status: number, message: string, riotCode: string | null, retryAfterMs: number | null = null) {
    super(codeForStatus(status), message)
    this.name = 'ApiError'
    this.status = status
    this.riotCode = riotCode
    this.retryAfterMs = retryAfterMs
  }
}

function codeForStatus(status: number): ErrorCode {
  if (status === 404) return 'NOT_FOUND'
  if (status === 401 || status === 403) return 'UNAUTHORIZED'
  if (status === 429) return 'RATE_LIMITED'
  return 'HTTP_ERROR'
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}
