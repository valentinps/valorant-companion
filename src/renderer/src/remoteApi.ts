import type { Events, IpcResult, RendererApi } from '../../shared/ipc'

// When the UI is opened on a phone (served by the PC's remote server) there is no Electron
// preload, so `window.api` is rebuilt on top of HTTP + a WebSocket for live events, with the same shape.

const KEY_STORAGE = 'remote-key'

/** The pairing key arrives once in the QR code link (?k=...), then lives in this browser's storage. */
function takeKey(): string | null {
  const url = new URL(location.href)
  const fromLink = url.searchParams.get('k')
  if (fromLink) {
    try {
      localStorage.setItem(KEY_STORAGE, fromLink)
    } catch {
      // Private browsing: the key only lasts for this tab.
    }
    // Keep the key out of the address bar, history and any screenshot.
    url.searchParams.delete('k')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    return fromLink
  }
  try {
    return localStorage.getItem(KEY_STORAGE)
  } catch {
    return null
  }
}

/** Must match UNPAIRED_CLOSE_CODE in src/main/remote/server.ts. */
const UNPAIRED_CLOSE_CODE = 4001
const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 15_000

export type RemoteConnection = 'connecting' | 'online' | 'offline' | 'unpaired'

export interface RemoteApi extends RendererApi {
  connection(): RemoteConnection
  onConnection(listener: (state: RemoteConnection) => void): () => void
}

export function createRemoteApi(): RemoteApi {
  const key = takeKey()
  const listeners = new Map<keyof Events, Set<(payload: never) => void>>()
  const connectionListeners = new Set<(state: RemoteConnection) => void>()
  let state: RemoteConnection = key ? 'connecting' : 'unpaired'
  let socket: WebSocket | null = null
  let retryMs = RETRY_MIN_MS

  const setState = (next: RemoteConnection) => {
    if (next === state) return
    state = next
    connectionListeners.forEach((l) => l(next))
  }

  const unpair = () => {
    try {
      localStorage.removeItem(KEY_STORAGE)
    } catch {
      // nothing stored
    }
    socket?.close()
    setState('unpaired')
  }

  /** One shared live connection, reopened with backoff whenever it drops (Wi-Fi blips, phone asleep). */
  const connect = () => {
    if (socket || !key || state === 'unpaired') return
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}/api/events?k=${encodeURIComponent(key)}`)
    socket = ws
    ws.onopen = () => {
      retryMs = RETRY_MIN_MS
      setState('online')
    }
    ws.onmessage = (e) => {
      const { event, payload } = JSON.parse(e.data as string) as { event: keyof Events; payload: never }
      listeners.get(event)?.forEach((l) => l(payload))
    }
    ws.onclose = (e) => {
      socket = null
      if (e.code === UNPAIRED_CLOSE_CODE) return unpair()
      if (state === 'unpaired') return
      setState('offline')
      setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS)
    }
  }

  // Phones freeze background tabs; reconnect right away when the page comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket) {
      retryMs = RETRY_MIN_MS
      connect()
    }
  })

  return {
    async invoke(command, ...args) {
      const res = await fetch(`/api/cmd/${command}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-remote-key': key ?? '' },
        body: JSON.stringify(args)
      }).catch(() => {
        throw Object.assign(new Error("Can't reach your PC. Check that it's on and on the same Wi-Fi"), {
          code: 'NETWORK_ERROR'
        })
      })
      if (res.status === 401) {
        unpair()
        throw Object.assign(new Error('This phone is no longer paired'), { code: 'UNPAIRED' })
      }
      const result = (await res.json()) as IpcResult<never>
      if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code })
      return result.data
    },

    on(event, listener) {
      connect()
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(listener as (payload: never) => void)
      return () => set.delete(listener as (payload: never) => void)
    },

    connection: () => state,

    onConnection(listener) {
      connectionListeners.add(listener)
      return () => connectionListeners.delete(listener)
    }
  }
}
