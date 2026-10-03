import type { Endpoint, Host, ParamsArg } from './endpoint'
import { ApiError } from './errors'
import { httpRequest } from './http'
import type { RiotSession } from './session'

// Riot expects the client to describe its platform; this is the value the PC client sends.
const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown'
  })
).toString('base64')

const MAX_RETRIES = 2
const MAX_RETRY_WAIT_MS = 10_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Executes endpoint definitions: resolves the host, adds auth headers, retries on expired tokens and rate limits. */
export class ApiClient {
  constructor(private readonly session: RiotSession) {}

  async call<P, R>(endpoint: Endpoint<P, R>, ...args: ParamsArg<P>): Promise<R> {
    const params = args[0] as P
    if (endpoint.host === 'local') {
      return this.session.localRequest<R>(endpoint.method, endpoint.path(params), endpoint.body?.(params))
    }
    let refreshTokens = false
    let reauthenticated = false
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.callRemote(endpoint, params, refreshTokens)
      } catch (err) {
        if (!(err instanceof ApiError) || attempt >= MAX_RETRIES) throw err
        if (isRejectedToken(err) && !refreshTokens) {
          refreshTokens = true
        } else if (isRejectedToken(err) && !reauthenticated) {
          // A fresh token was rejected too: the Riot Client may have restarted or re-logged in.
          reauthenticated = true
          await this.session.reauthenticate()
          refreshTokens = false
        } else if (err.status === 429) {
          // Riot's rate limit: wait as long as it asks (capped), then try again.
          await sleep(Math.min(err.retryAfterMs ?? 2000 * (attempt + 1), MAX_RETRY_WAIT_MS))
        } else {
          throw err
        }
      }
    }
  }

  private async callRemote<P, R>(endpoint: Endpoint<P, R>, params: P, refreshTokens: boolean): Promise<R> {
    const info = this.session.requireInfo()
    const tokens = await this.session.getTokens(refreshTokens)
    return httpRequest<R>({
      url: this.baseUrl(endpoint.host as Exclude<Host, 'local'>, info.region, info.shard) + endpoint.path(params),
      method: endpoint.method,
      body: endpoint.body?.(params),
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'X-Riot-Entitlements-JWT': tokens.entitlementToken,
        'X-Riot-ClientVersion': info.clientVersion,
        'X-Riot-ClientPlatform': CLIENT_PLATFORM
      }
    })
  }

  private baseUrl(host: Exclude<Host, 'local'>, region: string, shard: string): string {
    switch (host) {
      case 'pd':
        return `https://pd.${shard}.a.pvp.net`
      case 'glz':
        return `https://glz-${region}-1.${shard}.a.pvp.net`
      case 'shared':
        return `https://shared.${shard}.a.pvp.net`
    }
  }
}

/**
 * Riot rejects an expired access token with 401, but also with
 * 400 BAD_CLAIMS "Failure validating/decoding RSO Access Token".
 */
function isRejectedToken(err: ApiError): boolean {
  return err.status === 401 || err.riotCode === 'BAD_CLAIMS' || /RSO Access Token/i.test(err.message)
}
