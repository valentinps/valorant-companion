import { ipcMain, type WebContents } from 'electron'
import { COMMAND_CHANNEL_PREFIX, EVENT_CHANNEL_PREFIX, type Events, type IpcResult } from '../shared/ipc'
import type { Backend } from './backend'
import { AppError } from './core/errors'

/** Exposes every handler over IPC. Errors are returned as data so the UI gets a clean message. */
export function registerIpc(backend: Backend): void {
  for (const [command, handler] of Object.entries(backend.handlers)) {
    ipcMain.handle(COMMAND_CHANNEL_PREFIX + command, async (_event, ...args: unknown[]): Promise<IpcResult<unknown>> => {
      try {
        const data = await (handler as (...a: unknown[]) => unknown)(...args)
        return { ok: true, data: data ?? null }
      } catch (err) {
        const code = err instanceof AppError ? err.code : 'UNKNOWN'
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[ipc] ${command} failed:`, message)
        return { ok: false, error: { code, message } }
      }
    })
  }
}

/** Forwards backend events to a window. Returns an unsubscribe function. */
export function forwardEvents(backend: Backend, target: WebContents): () => void {
  const send = <E extends keyof Events>(event: E, payload: Events[E]) => {
    if (!target.isDestroyed()) target.send(EVENT_CHANNEL_PREFIX + event, payload)
  }
  const onStatus = (s: Events['status']) => send('status', s)
  const onResource = (r: Events['resource']) => send('resource', r)
  backend.tracker.on('status', onStatus)
  backend.tracker.on('resource', onResource)
  return () => {
    backend.tracker.off('status', onStatus)
    backend.tracker.off('resource', onResource)
  }
}
