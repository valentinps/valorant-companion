import { AppError } from './errors'
import { httpRequest } from './http'
import { basicAuth, readLockfile, type Lockfile } from './lockfile'
import { deploymentFromRiotRegion, readShooterGameLog } from './region'

export interface Tokens {
  accessToken: string
  entitlementToken: string
  puuid: string
}

export interface SessionInfo {
  puuid: string
  region: string
  shard: string
  clientVersion: string
}

interface EntitlementsTokenResponse {
  accessToken: string
  token: string
  subject: string
}

interface RegionLocaleResponse {
  region: string
  locale: string
}

// Access tokens live ~1h. Fetching them from the local client is cheap, so refresh often.
const TOKEN_TTL_MS = 5 * 60_000
/** Never use a token this close to its expiry. */
const EXPIRY_MARGIN_MS = 2 * 60_000

/**
 * Owns everything needed to talk to Riot on the user's behalf: the lockfile,
 * auth tokens, region/shard and client version. Borrowed from the running Riot Client,
 * so the app never handles the user's password.
 */
export class RiotSession {
  private lockfile: Lockfile | null = null
  private tokens: Tokens | null = null
  /** When the cached tokens must be fetched again. */
  private tokensStaleAt = 0
  private tokensInFlight: Promise<Tokens> | null = null
  private sessionInfo: SessionInfo | null = null

  get info(): SessionInfo | null {
    return this.sessionInfo
  }

  get isConnected(): boolean {
    return this.sessionInfo !== null
  }

  async connect(): Promise<SessionInfo> {
    const lockfile = await readLockfile()
    if (!lockfile) throw new AppError('RIOT_CLIENT_NOT_RUNNING', 'Riot Client is not running')
    this.lockfile = lockfile

    const tokens = await this.getTokens(true)
    const [deployment, clientVersion] = await Promise.all([this.detectDeployment(), this.detectClientVersion()])
    this.sessionInfo = { puuid: tokens.puuid, ...deployment, clientVersion }
    return this.sessionInfo
  }

  disconnect(): void {
    this.lockfile = null
    this.tokens = null
    this.sessionInfo = null
  }

  requireInfo(): SessionInfo {
    if (!this.sessionInfo) throw new AppError('NOT_CONNECTED', 'Not connected to the Riot Client')
    return this.sessionInfo
  }

  requireLockfile(): Lockfile {
    if (!this.lockfile) throw new AppError('NOT_CONNECTED', 'Not connected to the Riot Client')
    return this.lockfile
  }

  async getTokens(forceRefresh = false): Promise<Tokens> {
    if (!forceRefresh && this.tokens && Date.now() < this.tokensStaleAt) return this.tokens
    // Many requests can fail on the same expired token at once; refresh it only once.
    this.tokensInFlight ??= this.fetchTokens().finally(() => (this.tokensInFlight = null))
    return this.tokensInFlight
  }

  /**
   * Re-reads the lockfile in case the Riot Client restarted (new port and password),
   * then fetches fresh tokens. Used when Riot keeps rejecting tokens.
   */
  async reauthenticate(): Promise<Tokens> {
    const lockfile = await readLockfile()
    if (!lockfile) throw new AppError('RIOT_CLIENT_NOT_RUNNING', 'Riot Client is not running')
    this.lockfile = lockfile
    this.tokens = null
    return this.getTokens(true)
  }

  private async fetchTokens(): Promise<Tokens> {
    const res = await this.localRequest<EntitlementsTokenResponse>('GET', '/entitlements/v1/token')
    if (!res?.accessToken) {
      // The client is up but nobody is logged in yet.
      throw new AppError('NOT_CONNECTED', 'Riot Client is running but not logged in')
    }
    const expiresAt = jwtExpiry(res.accessToken)
    if (expiresAt !== null && expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      // The Riot Client hands out its token as-is; after sleep it can still be holding an expired one.
      this.tokens = null
      throw new AppError('UNAUTHORIZED', 'The Riot Client session has expired. It usually renews itself within a minute')
    }
    this.tokens = { accessToken: res.accessToken, entitlementToken: res.token, puuid: res.subject }
    const ttlEnd = Date.now() + TOKEN_TTL_MS
    this.tokensStaleAt = expiresAt === null ? ttlEnd : Math.min(ttlEnd, expiresAt - EXPIRY_MARGIN_MS)
    return this.tokens
  }

  /** Raw request to the local Riot Client API. */
  localRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const lockfile = this.requireLockfile()
    return httpRequest<T>({
      url: `https://127.0.0.1:${lockfile.port}${path}`,
      method,
      body,
      local: true,
      headers: { Authorization: basicAuth(lockfile) }
    })
  }

  private async detectDeployment(): Promise<{ region: string; shard: string }> {
    try {
      const res = await this.localRequest<RegionLocaleResponse>('GET', '/riotclient/region-locale')
      const mapped = res?.region ? deploymentFromRiotRegion(res.region) : null
      if (mapped) return mapped
    } catch {
      // fall through to the game log
    }
    const log = await readShooterGameLog()
    if (log.deployment) return log.deployment
    throw new AppError('NOT_CONNECTED', 'Could not determine your VALORANT region')
  }

  private async detectClientVersion(): Promise<string> {
    const log = await readShooterGameLog()
    if (log.clientVersion) return log.clientVersion
    const res = await httpRequest<{ data: { riotClientVersion: string } }>({
      url: 'https://valorant-api.com/v1/version',
      method: 'GET'
    })
    return res.data.riotClientVersion
  }
}

/** Expiry (ms) from a JWT's `exp` claim, or null if it can't be read. Not a signature check. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}
