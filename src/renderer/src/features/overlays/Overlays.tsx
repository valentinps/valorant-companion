import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { MatchView } from '../match/MatchView'
import { PlayerProfileModal } from '../profile/PlayerProfileModal'

export interface ProfileTarget {
  puuid: string
  /** Shown while the profile loads. */
  name?: string
  /** Streamer mode: show the profile without the player's name. */
  hidden?: boolean
}

export interface MatchTarget {
  matchId: string
  /** Whose side the match is shown from (their team first, their row highlighted). */
  perspectivePuuid: string
}

type Overlay = ({ kind: 'profile' } & ProfileTarget) | ({ kind: 'match' } & MatchTarget)

interface OverlayApi {
  openProfile: (target: ProfileTarget) => void
  openMatch: (target: MatchTarget) => void
}

const OverlayContext = createContext<OverlayApi | null>(null)

function useOverlays(): OverlayApi {
  const api = useContext(OverlayContext)
  if (!api) throw new Error('Overlay hooks must be used inside <OverlayProvider>')
  return api
}

/** Open any player's profile panel from anywhere: `useOpenProfile()({ puuid })`. */
export const useOpenProfile = () => useOverlays().openProfile

/** Open a finished match's breakdown from anywhere: `useOpenMatch()({ matchId, perspectivePuuid })`. */
export const useOpenMatch = () => useOverlays().openMatch

const sameOverlay = (a: Overlay, b: Overlay) =>
  a.kind === 'profile' && b.kind === 'profile'
    ? a.puuid === b.puuid
    : a.kind === 'match' && b.kind === 'match' && a.matchId === b.matchId && a.perspectivePuuid === b.perspectivePuuid

/**
 * Hosts the app's overlays as a history stack: each profile or match opened from inside another
 * is pushed on top, Back returns to the previous one and Close dismisses them all.
 * A match is drawn over the profile it was opened from, which stays mounted underneath.
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Overlay[]>([])

  const push = useCallback(
    (o: Overlay) => setStack((s) => (s.length > 0 && sameOverlay(s[s.length - 1], o) ? s : [...s, o])),
    []
  )
  const openProfile = useCallback((t: ProfileTarget) => push({ kind: 'profile', ...t }), [push])
  const openMatch = useCallback((t: MatchTarget) => push({ kind: 'match', ...t }), [push])
  const api = useMemo(() => ({ openProfile, openMatch }), [openProfile, openMatch])
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const closeAll = useCallback(() => setStack([]), [])

  const top = stack.length - 1
  const current = stack[top]
  // The profile to draw: the top entry itself, or the one directly beneath a match.
  const profileIndex = current?.kind === 'profile' ? top : stack[top - 1]?.kind === 'profile' ? top - 1 : -1
  const profile = stack[profileIndex]
  const onBack = top > 0 ? back : undefined

  return (
    <OverlayContext.Provider value={api}>
      {children}
      {profile?.kind === 'profile' && (
        <PlayerProfileModal
          key={`${profileIndex}:${profile.puuid}`}
          puuid={profile.puuid}
          name={profile.name}
          hidden={profile.hidden}
          onClose={closeAll}
          onBack={profileIndex > 0 ? back : undefined}
          inert={profileIndex !== top}
        />
      )}
      {current?.kind === 'match' && (
        <MatchView
          key={`${top}:${current.matchId}:${current.perspectivePuuid}`}
          matchId={current.matchId}
          perspectivePuuid={current.perspectivePuuid}
          onClose={closeAll}
          onBack={onBack}
        />
      )}
    </OverlayContext.Provider>
  )
}
