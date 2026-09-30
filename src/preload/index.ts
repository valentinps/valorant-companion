import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  COMMAND_CHANNEL_PREFIX,
  EVENT_CHANNEL_PREFIX,
  type IpcResult,
  type RendererApi
} from '../shared/ipc'

// The only bridge between the UI and Node. It exposes typed commands and events, nothing else.
const api: RendererApi = {
  async invoke(command, ...args) {
    const result = (await ipcRenderer.invoke(COMMAND_CHANNEL_PREFIX + command, ...args)) as IpcResult<never>
    if (!result.ok) {
      const error = new Error(result.error.message) as Error & { code: string }
      error.code = result.error.code
      throw error
    }
    return result.data
  },

  on(event, listener) {
    const channel = EVENT_CHANNEL_PREFIX + event
    const wrapped = (_e: IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('api', api)
