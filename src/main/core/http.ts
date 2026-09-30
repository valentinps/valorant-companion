import https from 'node:https'
import { ApiError, AppError } from './errors'

// The local Riot Client API uses a self-signed certificate, so certificate checks are
// disabled for 127.0.0.1 only. Remote Riot hosts keep normal TLS verification.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })
const remoteAgent = new https.Agent({ keepAlive: true })

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface HttpRequest {
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  /** Skip TLS verification. Only used for the local Riot Client. */
  local?: boolean
  timeoutMs?: number
}

export function httpRequest<T = unknown>(req: HttpRequest): Promise<T> {
  const payload = req.body === undefined ? undefined : JSON.stringify(req.body)
  const headers: Record<string, string> = { Accept: 'application/json', ...req.headers }
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers['Content-Length'] = Buffer.byteLength(payload).toString()
  }

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      req.url,
      { method: req.method, headers, agent: req.local ? localAgent : remoteAgent },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const data = parseBody(text)
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) {
            resolve(data as T)
            return
          }
          const riot = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
          const message =
            (typeof riot.message === 'string' && riot.message) || text.trim() || `HTTP ${status}`
          const riotCode = typeof riot.errorCode === 'string' ? riot.errorCode : null
          const retryAfter = Number(res.headers['retry-after'])
          const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : null
          reject(new ApiError(status, `${req.method} ${redactUrl(req.url)} failed: ${message}`, riotCode, retryAfterMs))
        })
      }
    )
    request.setTimeout(req.timeoutMs ?? 10_000, () => {
      request.destroy(new AppError('NETWORK_ERROR', `Request timed out: ${redactUrl(req.url)}`))
    })
    request.on('error', (err) => {
      reject(err instanceof AppError ? err : new AppError('NETWORK_ERROR', err.message))
    })
    if (payload !== undefined) request.write(payload)
    request.end()
  })
}

function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Keep error messages short: drop the query string. */
function redactUrl(url: string): string {
  return url.split('?')[0]
}
