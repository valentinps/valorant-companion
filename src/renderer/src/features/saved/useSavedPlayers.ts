import { useCallback, useState } from 'react'
import { api, useCommand } from '../../api'
import type { SavedPlayer } from '../../../../shared/types'

/** The saved players list, kept fresh across every open window and page. */
export function useSavedPlayers() {
  return useCommand('saved.list', [], { refreshOn: ['saved'] })
}

/** Save / unsave toggle state for one player. */
export function useSavedToggle(puuid: string, hidden: boolean) {
  const saved = useSavedPlayers()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSaved = saved.data?.some((s: SavedPlayer) => s.puuid === puuid) ?? false

  const toggle = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      await (isSaved ? api.invoke('saved.remove', puuid) : api.invoke('saved.add', puuid, hidden))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }, [isSaved, puuid, hidden])

  return { isSaved, ready: saved.data !== undefined, pending, error, toggle }
}
