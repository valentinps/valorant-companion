import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { dirname, extname, join, normalize, sep } from 'node:path'
import QRCode from 'qrcode'
import { WebSocket, WebSocketServer } from 'ws'
import type { CommandName, Events, IpcResult } from '../../shared/ipc'
import type { RemoteMode, RemoteView } from '../../shared/types'
import type { GameStateTracker } from '../state/gameState'
import { lanAddresses } from './network'
import { CloudflareTunnel } from './tunnel'

export type Dispatch = (command: CommandName, args: unknown[]) => Promise<IpcResult<unknown>>

/** Where the phone gets the UI from: the built renderer, or the Vite dev server while developing. */
export type UiSource = { dir: string } | { devUrl: string }

interface Settings {
  enabled: boolean
  /** internet: through a Cloudflare tunnel (works anywhere). lan: phones connect straight to this PC. */
  mode: RemoteMode
  key: string
  port: number
}

const DEFAULT_PORT = 47800
/** Ports tried, from the saved one, if it's taken. */
const PORT_ATTEMPTS = 10
const KEY_HEADER = 'x-remote-key'
const MAX_BODY_BYTES = 64 * 1024
/** Keeps phones, routers and the tunnel from dropping an idle event connection. */
const PING_MS = 25_000
/** WebSocket close code telling the phone its key is no longer valid. */
export const UNPAIRED_CLOSE_CODE = 4001

// Commands that manage pairing itself stay on the PC: a paired phone can't unpair others or read the key.
const DESKTOP_ONLY = (command: string) => command.startsWith('remote.')

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
}

// Same policy as the desktop window; the page only talks back to this server.
const CSP =
  "default-src 'self'; img-src 'self' https://media.valorant-api.com data:; style-src 'self' 'unsafe-inline'"

/**
 * Serves the app's UI to a phone, plus a small HTTP API that mirrors IPC:
 *   POST /api/cmd/<command>   body: JSON array of args   -> IpcResult
 *   WS   /api/events?k=<key>   live events, as JSON { event, payload }: status, resource
 * Every API call must carry the pairing key, which only the QR code on the PC shows.
 * Off until the user turns it on. In internet mode the server only listens on 127.0.0.1 and the
 * phone comes in through the tunnel; in LAN mode it listens on every interface.
 */
export class RemoteServer {
  private settings: Settings | null = null
  private server: http.Server | null = null
  private port: number | null = null
  private error: string | null = null
  private clients = new Set<WebSocket>()
  private readonly sockets = new WebSocketServer({ noServer: true })
  /** Last request from another device: tells "blocked before reaching the app" apart from app problems. */
  private lastVisit: { address: string; at: number } | null = null
  private writing: Promise<void> = Promise.resolve()
  private readonly tunnel: CloudflareTunnel

  constructor(
    private readonly options: {
      tracker: GameStateTracker
      dispatch: Dispatch
      ui?: UiSource
      settingsFile?: string
      /** Where helper programs (cloudflared) are downloaded to. */
      toolsDir: string
      /** Called when anything shown on the PC's Phone page changes. */
      onChange?: () => void
    }
  ) {
    this.tunnel = new CloudflareTunnel(options.toolsDir, () => this.changed())
  }

  /** Starts the server if it was left on last time. */
  async restore(): Promise<void> {
    const s = await this.load()
    if (s.enabled) await this.listen().catch(() => {})
  }

  async view(): Promise<RemoteView> {
    const s = await this.load()
    const tunnel = this.tunnel.current
    const urls = !this.port
      ? []
      : s.mode === 'internet'
        ? tunnel.url
          ? [{ label: 'Internet', url: `${tunnel.url}/?k=${s.key}` }]
          : []
        : lanAddresses().map((a) => ({ label: a.label, url: `http://${a.address}:${this.port}/?k=${s.key}` }))
    return {
      enabled: s.enabled,
      mode: s.mode,
      tunnel: { state: tunnel.state, progress: tunnel.progress, error: tunnel.error },
      running: this.server !== null,
      port: this.port,
      error: this.error,
      connectedClients: this.clients.size,
      lastVisit: this.lastVisit,
      links: await Promise.all(
        urls.map(async (u) => ({
          ...u,
          qrSvg: await QRCode.toString(u.url, {
            type: 'svg',
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0f1923', light: '#ece8e1' }
          })
        }))
      )
    }
  }

  async setEnabled(enabled: boolean): Promise<RemoteView> {
    const s = await this.load()
    s.enabled = enabled
    await this.persist()
    if (enabled) await this.listen().catch(() => {})
    else await this.close()
    this.changed()
    return this.view()
  }

  async setMode(mode: RemoteMode): Promise<RemoteView> {
    const s = await this.load()
    if (s.mode !== mode) {
      s.mode = mode
      await this.persist()
      // The listening address depends on the mode.
      if (this.server) {
        await this.close()
        await this.listen().catch(() => {})
      }
      this.changed()
    }
    return this.view()
  }

  /** New key: every paired phone is signed out and has to scan again. */
  async resetKey(): Promise<RemoteView> {
    const s = await this.load()
    s.key = newKey()
    await this.persist()
    for (const ws of this.clients) ws.close(UNPAIRED_CLOSE_CODE, 'Unpaired')
    this.changed()
    return this.view()
  }

  async stop(): Promise<void> {
    await this.close()
  }

  // ---------- Server lifecycle ----------

  private async listen(): Promise<void> {
    if (this.server) return
    const s = await this.load()
    this.error = null
    for (let i = 0; i < PORT_ATTEMPTS; i++) {
      const port = s.port + i
      const server = http.createServer((req, res) => void this.route(req, res))
      server.on('upgrade', (req, socket, head) => void this.upgrade(req, socket, head))
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          // LAN: every interface, so phones can reach it. Internet: only cloudflared, on this PC, connects.
          server.listen(port, s.mode === 'lan' ? '0.0.0.0' : '127.0.0.1', () => resolve())
        })
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') continue
        this.error = `Could not start: ${(err as Error).message}`
        throw err
      }
      server.on('error', (err) => console.error('[remote] server error:', err))
      this.server = server
      this.port = port
      this.options.tracker.on('status', this.onStatus)
      this.options.tracker.on('resource', this.onResource)
      if (s.mode === 'internet') void this.tunnel.start(port)
      if (port !== s.port) {
        // Keep the new port so the phone's saved link keeps working next time.
        s.port = port
        await this.persist()
      }
      return
    }
    this.error = `Ports ${s.port}-${s.port + PORT_ATTEMPTS - 1} are all in use`
    throw new Error(this.error)
  }

  private async close(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    this.port = null
    this.tunnel.stop()
    this.options.tracker.off('status', this.onStatus)
    this.options.tracker.off('resource', this.onResource)
    for (const ws of this.clients) ws.terminate()
    this.clients.clear()
    const closed = new Promise<void>((resolve) => server.close(() => resolve()))
    // Phones keep idle keep-alive connections open; close() alone would wait for them.
    server.closeAllConnections()
    await closed
  }

  // ---------- Routing ----------

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://phone')
    this.recordVisit(visitorAddress(req))
    try {
      if (url.pathname.startsWith('/api/')) {
        const key = (req.headers[KEY_HEADER] as string | undefined) ?? url.searchParams.get('k') ?? ''
        if (!(await this.isValidKey(key))) return sendJson(res, 401, { ok: false, error: { code: 'UNPAIRED', message: 'Not paired' } })
        const command = /^\/api\/cmd\/([\w.]+)$/.exec(url.pathname)?.[1]
        if (req.method === 'POST' && command) return await this.runCommand(command, req, res)
        return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } })
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed')
      await this.serveUi(url.pathname, req, res)
    } catch (err) {
      console.error('[remote] request failed:', err)
      if (!res.headersSent) sendText(res, 500, 'Internal error')
      else res.end()
    }
  }

  private async runCommand(command: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (DESKTOP_ONLY(command)) {
      return sendJson(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Only available on the PC' } })
    }
    let args: unknown
    try {
      const body = await readBody(req)
      args = body ? JSON.parse(body) : []
    } catch {
      return sendJson(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid request body' } })
    }
    if (!Array.isArray(args)) {
      return sendJson(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'Arguments must be an array' } })
    }
    const result = await this.options.dispatch(command as CommandName, args)
    sendJson(res, 200, result)
  }

  /**
   * Live events over WebSocket: the same pushes the desktop window gets over IPC.
   * (Not server-sent events: Cloudflare's tunnel holds those back instead of streaming them.)
   */
  private async upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://phone')
    // Anything else is Vite's hot reload client (development only): refuse it.
    if (url.pathname !== '/api/events') return void socket.destroy()
    this.recordVisit(visitorAddress(req))
    const valid = await this.isValidKey(url.searchParams.get('k') ?? '')
    this.sockets.handleUpgrade(req, socket, head, (ws) => {
      // Accept, then close with a code the phone understands, so it shows the pairing screen instead of retrying.
      if (!valid) return ws.close(UNPAIRED_CLOSE_CODE, 'Unpaired')
      this.openEvents(ws)
    })
  }

  private openEvents(ws: WebSocket): void {
    send(ws, 'status', this.options.tracker.status)
    let alive = true
    ws.on('pong', () => (alive = true))
    const ping = setInterval(() => {
      if (!alive) return ws.terminate() // phone vanished without closing (Wi-Fi off, app killed)
      alive = false
      ws.ping()
    }, PING_MS)
    this.clients.add(ws)
    this.changed()
    ws.on('error', () => ws.terminate())
    ws.on('close', () => {
      clearInterval(ping)
      if (this.clients.delete(ws)) this.changed()
    })
  }

  private onStatus = (status: Events['status']) => this.broadcast('status', status)
  private onResource = (resource: Events['resource']) => {
    // The Phone page itself is PC-only; phones never need to hear about it.
    if (resource !== 'remote') this.broadcast('resource', resource)
  }

  private broadcast<E extends keyof Events>(event: E, payload: Events[E]): void {
    for (const ws of this.clients) send(ws, event, payload)
  }

  private recordVisit(raw: string | undefined): void {
    const address = raw?.replace(/^::ffff:/, '')
    if (!address || address === '127.0.0.1' || address === '::1') return
    const first = this.lastVisit === null || Date.now() - this.lastVisit.at > 60_000
    this.lastVisit = { address, at: Date.now() }
    if (first) this.changed()
  }

  // ---------- UI files ----------

  private async serveUi(pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const ui = this.options.ui
    if (!ui) return sendText(res, 404, 'The app UI is not available')
    if ('devUrl' in ui) return proxy(ui.devUrl + pathname, req, res)

    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
    const file = join(ui.dir, relative)
    // Never serve anything outside the UI folder.
    if (file !== ui.dir && !file.startsWith(ui.dir + sep)) return sendText(res, 403, 'Forbidden')
    const info = await stat(file).catch(() => null)
    const target = info?.isFile() ? file : join(ui.dir, 'index.html')
    const isIndex = target.endsWith('index.html')
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
      'Content-Security-Policy': CSP,
      // Built assets have hashed names; the page itself must always be fresh.
      'Cache-Control': isIndex ? 'no-store' : 'public, max-age=31536000, immutable'
    })
    if (req.method === 'HEAD') return void res.end()
    createReadStream(target).pipe(res)
  }

  // ---------- Settings ----------

  private async isValidKey(key: string): Promise<boolean> {
    const expected = Buffer.from((await this.load()).key)
    const given = Buffer.from(key)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  private async load(): Promise<Settings> {
    if (this.settings) return this.settings
    let saved: Partial<Settings> = {}
    const file = this.options.settingsFile
    if (file) {
      try {
        saved = JSON.parse(await readFile(file, 'utf8')) as Partial<Settings>
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[remote] could not read settings:', err)
      }
    }
    this.settings ??= {
      enabled: saved.enabled === true,
      mode: saved.mode === 'lan' ? 'lan' : 'internet',
      key: typeof saved.key === 'string' && saved.key.length >= 16 ? saved.key : newKey(),
      port: Number.isInteger(saved.port) ? (saved.port as number) : DEFAULT_PORT
    }
    if (!saved.key) await this.persist()
    return this.settings
  }

  private persist(): Promise<void> {
    const file = this.options.settingsFile
    const data = JSON.stringify(this.settings, null, 2)
    this.writing = this.writing
      .then(async () => {
        if (!file) return
        await mkdir(dirname(file), { recursive: true })
        await writeFile(`${file}.tmp`, data)
        await rename(`${file}.tmp`, file)
      })
      .catch((err) => console.error('[remote] could not save settings:', err))
    return this.writing
  }

  private changed(): void {
    this.options.onChange?.()
  }
}

function newKey(): string {
  return randomBytes(18).toString('base64url')
}

function send(ws: WebSocket, event: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, payload }))
}

/** Through the tunnel every request comes from 127.0.0.1; Cloudflare passes on the real address. */
function visitorAddress(req: http.IncomingMessage): string | undefined {
  const forwarded = req.headers['cf-connecting-ip']
  return typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(text)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Development only: forwards UI requests to the Vite dev server (hot reload won't reach the phone). */
function proxy(target: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  const upstream = http.request(target, { method: req.method, headers: { accept: req.headers.accept ?? '*/*' } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers)
    up.pipe(res)
  })
  upstream.on('error', () => sendText(res, 502, 'Dev server unreachable'))
  upstream.end()
}
