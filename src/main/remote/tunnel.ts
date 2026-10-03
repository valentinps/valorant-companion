import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { Resolver } from 'node:dns/promises'
import https from 'node:https'
import { join } from 'node:path'
import type { TunnelState } from '../../shared/types'

// Cloudflare's official binary, from its GitHub releases.
const RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'
const ASSETS: Partial<Record<string, string>> = {
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-arm64': 'cloudflared-windows-amd64.exe', // runs under emulation
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64'
}

// cloudflared prints the public address once the tunnel is up. api.trycloudflare.com is its own control endpoint.
const URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/
const RESTART_DELAY_MS = 5_000
const DNS_TIMEOUT_MS = 60_000

export interface TunnelStatus {
  state: TunnelState
  /** Public https address, once ready. */
  url: string | null
  /** 0-100 while downloading cloudflared. */
  progress: number | null
  error: string | null
}

/**
 * A Cloudflare "quick tunnel": a free, account-less https address that forwards to a local port.
 * The PC only makes outgoing connections, so firewalls, routers and phone VPNs don't matter, and
 * the phone works on mobile data too. The address changes every time the tunnel starts.
 */
export class CloudflareTunnel {
  private process: ChildProcess | null = null
  private status: TunnelStatus = { state: 'off', url: null, progress: null, error: null }
  private wanted: { port: number } | null = null
  private restartTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly toolsDir: string,
    private readonly onChange: () => void
  ) {}

  get current(): TunnelStatus {
    return this.status
  }

  async start(port: number): Promise<void> {
    this.wanted = { port }
    if (this.process) return
    try {
      const bin = await this.ensureBinary()
      if (this.wanted?.port !== port) return // stopped or restarted while downloading
      this.launch(bin, port)
    } catch (err) {
      this.set({ state: 'error', url: null, progress: null, error: `Could not start the tunnel: ${(err as Error).message}` })
    }
  }

  stop(): void {
    this.wanted = null
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const child = this.process
    this.process = null
    child?.kill()
    this.set({ state: 'off', url: null, progress: null, error: null })
  }

  private launch(bin: string, port: number): void {
    this.set({ state: 'starting', url: null, progress: null, error: null })
    const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.process = child
    let log = ''
    let url: string | null = null
    let waiting = false
    const onOutput = (chunk: Buffer) => {
      const text = chunk.toString()
      log = (log + text).slice(-4000)
      url ??= URL_PATTERN.exec(log)?.[0] ?? null
      // The address is printed first; it only forwards once a connection to Cloudflare's edge is registered.
      if (url && !waiting && /Registered tunnel connection/.test(log)) {
        waiting = true
        void this.waitForDns(child, url)
      }
    }
    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', onOutput)
    child.on('error', (err) => console.error('[tunnel] could not run cloudflared:', err))
    child.on('exit', (code) => {
      if (this.process !== child) return // stopped on purpose
      this.process = null
      console.error(`[tunnel] cloudflared exited (${code}):\n${log}`)
      this.set({ state: 'error', url: null, progress: null, error: 'The tunnel closed unexpectedly, retrying...' })
      // Usually a network hiccup: try again while remote access is still wanted.
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        if (this.wanted) void this.start(this.wanted.port)
      }, RESTART_DELAY_MS)
    })
  }

  /**
   * A brand new hostname takes 10-20 seconds to exist in DNS. If the phone looks it up before that,
   * its resolver (and the router's) caches "not found" for a while. So the link is only shown once
   * public resolvers know it.
   */
  private async waitForDns(child: ChildProcess, url: string): Promise<void> {
    const host = new URL(url).hostname
    const deadline = Date.now() + DNS_TIMEOUT_MS
    while (this.process === child && Date.now() < deadline && !(await resolvesPublicly(host))) {
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (this.process === child) this.set({ state: 'ready', url, progress: null, error: null })
  }

  /** Downloads cloudflared once into the app's data folder. */
  private async ensureBinary(): Promise<string> {
    const asset = ASSETS[`${process.platform}-${process.arch}`]
    if (!asset) throw new Error(`no cloudflared build for ${process.platform}-${process.arch}`)
    const bin = join(this.toolsDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
    if ((await stat(bin).catch(() => null))?.isFile()) return bin

    await mkdir(this.toolsDir, { recursive: true })
    const tmp = `${bin}.download`
    this.set({ state: 'downloading', url: null, progress: 0, error: null })
    try {
      await download(RELEASES + asset, tmp, (progress) => {
        if (progress !== this.status.progress) this.set({ ...this.status, progress })
      })
      if (process.platform !== 'win32') await chmod(tmp, 0o755)
      await rename(tmp, bin)
    } catch (err) {
      await rm(tmp, { force: true })
      throw new Error(`downloading cloudflared failed (${(err as Error).message})`)
    }
    return bin
  }

  private set(next: TunnelStatus): void {
    this.status = next
    this.onChange()
  }
}

function download(url: string, dest: string, onProgress: (percent: number) => void, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'valorant-companion' } }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
          res.resume()
          download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects - 1).then(resolve, reject)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status}`))
          return
        }
        const total = Number(res.headers['content-length']) || 0
        let received = 0
        res.on('data', (c: Buffer) => {
          received += c.length
          if (total) onProgress(Math.floor((received / total) * 100))
        })
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

// Public resolvers your phone doesn't use, so asking them early never leaves a cached "not found"
// on the router or the ISP's resolver. Several, since some networks block one or another.
const PUBLIC_RESOLVERS = ['9.9.9.9', '8.8.8.8', '1.1.1.1']

async function resolvesPublicly(host: string): Promise<boolean> {
  let reachable = false
  for (const server of PUBLIC_RESOLVERS) {
    const resolver = new Resolver({ timeout: 2000, tries: 1 })
    resolver.setServers([server])
    try {
      if ((await resolver.resolve4(host)).length > 0) return true
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOTFOUND' || code === 'ENODATA') reachable = true // answered: not there yet
    }
  }
  // No resolver answered at all: can't tell, so don't hold the link back.
  return !reachable
}
