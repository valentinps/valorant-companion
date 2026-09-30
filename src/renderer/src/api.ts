import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { CommandArgs, CommandName, CommandResult } from '../../shared/ipc'
import type { AppStatus, ResourceName } from '../../shared/types'

export const api = window.api

export const StatusContext = createContext<AppStatus | null>(null)

/** Current connection + game phase. Provided once at the app root. */
export function useStatus(): AppStatus {
  const status = useContext(StatusContext)
  if (!status) throw new Error('useStatus must be used inside <StatusContext.Provider>')
  return status
}

/** Subscribes to status pushes from the backend. Used by the app root only. */
export function useStatusSubscription(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(null)
  useEffect(() => {
    const off = api.on('status', setStatus)
    void api.invoke('status.get').then(setStatus)
    return off
  }, [])
  return status
}

interface QueryOptions {
  /** Refetch when the backend reports these resources changed (live WebSocket events). */
  refreshOn?: ResourceName[]
  /** Fallback polling interval. */
  intervalMs?: number
  /** Skip fetching (e.g. while the game is closed). */
  enabled?: boolean
}

export interface QueryState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * Fetch data from a backend command and keep it fresh.
 *   const { data } = useCommand('party.get', [], { refreshOn: ['party'], intervalMs: 5000 })
 */
export function useCommand<K extends CommandName>(
  command: K,
  args: CommandArgs<K>,
  options: QueryOptions = {}
): QueryState<CommandResult<K>> {
  const { refreshOn, intervalMs, enabled = true } = options
  const [data, setData] = useState<CommandResult<K>>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const requestId = useRef(0)
  const argsKey = JSON.stringify(args)
  const refreshKey = refreshOn?.join(',') ?? ''

  const reload = useCallback(() => {
    if (!enabled) return
    const id = ++requestId.current
    setLoading(true)
    api
      .invoke(command, ...(JSON.parse(argsKey) as CommandArgs<K>))
      .then((result) => {
        if (id !== requestId.current) return
        setData(result)
        setError(null)
      })
      .catch((err: Error) => {
        if (id === requestId.current) setError(err.message)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [command, argsKey, enabled])

  useEffect(() => {
    reload()
    if (!enabled) return
    const timers: (() => void)[] = []
    if (intervalMs) {
      const t = setInterval(reload, intervalMs)
      timers.push(() => clearInterval(t))
    }
    if (refreshKey) {
      const resources = refreshKey.split(',')
      // Riot sends bursts of change events; coalesce them into one refetch.
      let pending: ReturnType<typeof setTimeout> | undefined
      const off = api.on('resource', (r) => {
        if (!resources.includes(r)) return
        clearTimeout(pending)
        pending = setTimeout(reload, 150)
      })
      timers.push(off, () => clearTimeout(pending))
    }
    return () => timers.forEach((stop) => stop())
  }, [reload, intervalMs, refreshKey, enabled])

  return { data, error, loading, reload }
}

export interface ActionState<K extends CommandName> {
  run: (...args: CommandArgs<K>) => Promise<boolean>
  pending: boolean
  error: string | null
}

/** Run a command that changes something (select agent, start queue...). */
export function useAction<K extends CommandName>(command: K, onDone?: () => void): ActionState<K> {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (...args: CommandArgs<K>) => {
      setPending(true)
      setError(null)
      try {
        await api.invoke(command, ...args)
        onDone?.()
        return true
      } catch (err) {
        setError((err as Error).message)
        return false
      } finally {
        setPending(false)
      }
    },
    [command, onDone]
  )

  return { run, pending, error }
}
