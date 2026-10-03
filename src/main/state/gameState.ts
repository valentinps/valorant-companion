import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { AppStatus, GamePhase, PlayerRef, ResourceName } from '../../shared/types'
import type { ApiClient } from '../core/apiClient'
import { AppError } from '../core/errors'
import { basicAuth } from '../core/lockfile'
import type { RiotSession } from '../core/session'
import { isNotFound } from '../core/errors'
import { Coregame, Local } from '../endpoints'
import type { RawPresence } from '../endpoints/local'
import { findOwnPresence } from './presence'

export interface GameStateEvents {
  status: [AppStatus]
  /** A pregame/party/coregame resource changed server-side. */
  resource: [ResourceName]
}

const POLL_INTERVAL_MS = 3000
/** How often to check whether agent select has turned into a match (the loading screen). */
const LOADING_PROBE_MS = 3000

// Local WebSocket events we listen to (the event name is the endpoint path with "/" -> "_").
const PRESENCE_EVENT = 'OnJsonApiEvent_chat_v4_presences'
// Riot's messaging service relays server-side changes to parties, agent select and matches.
const RMS_EVENT = 'OnJsonApiEvent_riot-messaging-service_v1_message'

const RMS_RESOURCES: [RegExp, ResourceName][] = [
  [/ares-pregame/, 'pregame'],
  [/ares-parties/, 'party'],
  [/ares-core-game/, 'coregame']
]

/**
 * Tracks connection to the Riot Client and which phase the game is in
 * (menus / agent select / in game), and relays live change notifications.
 * Every feature that reacts to the game state subscribes here instead of polling Riot.
 */
export class GameStateTracker extends EventEmitter<GameStateEvents> {
  private current: AppStatus = emptyStatus('DISCONNECTED')
  private timer: NodeJS.Timeout | null = null
  private socket: WebSocket | null = null
  private ticking = false
  /** What presence last said, before the loading screen correction below. */
  private presencePhase: GamePhase = 'GAME_CLOSED'
  /**
   * Presence keeps saying "agent select" through the whole loading screen, but the match
   * already exists on Riot's side. Set once it does, so the live match shows up during loading.
   */
  private matchStarted = false
  private lastProbe = 0
  private probing = false

  constructor(
    private readonly session: RiotSession,
    private readonly api: ApiClient,
    private readonly resolvePlayer: (puuid: string) => Promise<PlayerRef>
  ) {
    super()
  }

  get status(): AppStatus {
    return this.current
  }

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.closeSocket()
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      if (!this.session.isConnected) await this.connect()
      if (this.session.isConnected) {
        await this.refreshPresence()
        await this.probeLoadingScreen()
        // Reconnect the event socket if it dropped while the client stayed up.
        if (this.session.isConnected && !this.socket) this.openSocket()
      }
    } finally {
      this.ticking = false
    }
  }

  private async connect(): Promise<void> {
    try {
      const info = await this.session.connect()
      const player = await this.resolvePlayer(info.puuid).catch(() => null)
      this.update({
        ...emptyStatus('GAME_CLOSED'),
        player,
        region: info.region,
        shard: info.shard,
        clientVersion: info.clientVersion
      })
      this.openSocket()
    } catch (err) {
      this.session.disconnect()
      const message = err instanceof AppError && err.code === 'RIOT_CLIENT_NOT_RUNNING' ? null : errorMessage(err)
      this.update({ ...emptyStatus('DISCONNECTED'), error: message })
    }
  }

  private async refreshPresence(): Promise<void> {
    try {
      const { presences } = await this.api.call(Local.getPresences)
      this.applyPresences(presences)
    } catch {
      // The Riot Client went away (lockfile port closed). Start over.
      this.handleDisconnect()
    }
  }

  private applyPresences(presences: RawPresence[]): void {
    const puuid = this.session.info?.puuid
    if (!puuid) return
    const own = findOwnPresence(presences, puuid)
    // Presence updates from the WebSocket may only contain other players.
    if (!own && !presences.some((p) => p.puuid === puuid)) return
    this.presencePhase = own ? own.loopState : 'GAME_CLOSED'
    if (this.presencePhase !== 'PREGAME') this.matchStarted = false
    this.update({
      ...this.current,
      phase: this.presencePhase === 'PREGAME' && this.matchStarted ? 'INGAME' : this.presencePhase,
      partyId: own?.partyId ?? null,
      error: null
    })
  }

  /** While presence says agent select, check whether the match has been created yet. */
  private async probeLoadingScreen(force = false): Promise<void> {
    const puuid = this.session.info?.puuid
    if (!puuid || this.presencePhase !== 'PREGAME' || this.matchStarted || this.probing) return
    if (!force && Date.now() - this.lastProbe < LOADING_PROBE_MS) return
    this.probing = true
    this.lastProbe = Date.now()
    try {
      await this.api.call(Coregame.getCoregamePlayer, { puuid })
      if (this.presencePhase !== 'PREGAME') return
      this.matchStarted = true
      this.update({ ...this.current, phase: 'INGAME' })
      this.emit('resource', 'coregame')
    } catch (err) {
      if (!isNotFound(err)) console.warn('[state] loading screen check failed:', errorMessage(err))
    } finally {
      this.probing = false
    }
  }

  private openSocket(): void {
    this.closeSocket()
    const lockfile = this.session.requireLockfile()
    const socket = new WebSocket(`wss://127.0.0.1:${lockfile.port}`, {
      headers: { Authorization: basicAuth(lockfile) },
      rejectUnauthorized: false // self-signed local certificate
    })
    socket.on('open', () => {
      socket.send(JSON.stringify([5, PRESENCE_EVENT]))
      socket.send(JSON.stringify([5, RMS_EVENT]))
    })
    socket.on('message', (raw) => this.onSocketMessage(raw.toString()))
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
    })
    socket.on('error', () => socket.close())
    this.socket = socket
  }

  private onSocketMessage(text: string): void {
    if (!text) return
    let message: unknown
    try {
      message = JSON.parse(text)
    } catch {
      return
    }
    // Format: [8, eventName, { data, eventType, uri }]
    if (!Array.isArray(message) || message[0] !== 8) return
    const [, event, payload] = message as [number, string, { data: unknown; uri: string }]

    if (event === PRESENCE_EVENT) {
      const data = payload.data as { presences?: RawPresence[] } | null
      if (data?.presences) this.applyPresences(data.presences)
      this.emit('resource', 'friends')
    } else if (event === RMS_EVENT) {
      const uri = (payload.data as { resource?: string } | null)?.resource ?? payload.uri
      for (const [pattern, resource] of RMS_RESOURCES) {
        if (pattern.test(uri)) this.emit('resource', resource)
      }
      // The match was just created: no need to wait for the next probe.
      if (/ares-core-game/.test(uri)) void this.probeLoadingScreen(true)
    }
  }

  private closeSocket(): void {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    socket.removeAllListeners()
    socket.on('error', () => {}) // closing a half-open socket can still emit an error
    socket.close()
  }

  private handleDisconnect(): void {
    this.closeSocket()
    this.session.disconnect()
    this.presencePhase = 'GAME_CLOSED'
    this.matchStarted = false
    this.update(emptyStatus('DISCONNECTED'))
  }

  private update(next: AppStatus): void {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return
    this.current = next
    this.emit('status', next)
  }
}

function emptyStatus(phase: GamePhase): AppStatus {
  return { phase, player: null, region: null, shard: null, clientVersion: null, partyId: null, error: null }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
