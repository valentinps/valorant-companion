import { ipcMain, type WebContents } from 'electron'
import { COMMAND_CHANNEL_PREFIX, EVENT_CHANNEL_PREFIX, type Events } from '../shared/ipc'
import type { Backend } from './backend'
import { runCommand } from './handlers'

/** Exposes every handler over IPC. */
export function registerIpc(backend: Backend): void {
  for (const command of Object.keys(backend.handlers)) {
    ipcMain.handle(COMMAND_CHANNEL_PREFIX + command, (_event, ...args: unknown[]) =>
      runCommand(backend.handlers, command, args)
    )
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
