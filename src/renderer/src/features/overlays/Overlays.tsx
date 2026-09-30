import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { MatchView } from '../match/MatchView'
import { PlayerProfileModal } from '../profile/PlayerProfileModal'

export interface ProfileTarget {
  puuid: string
  /** Shown while the profile loads. */
  name?: string
}

export interface MatchTarget {
  matchId: string
  /** Whose side the match is shown from (their team first, their row highlighted). */
  perspectivePuuid: string
}

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

/**
 * Hosts the app's overlays: the profile window and, above it, the match view.
 * Opening a player from inside a match closes the match and shows their profile.
 */
export function OverlayProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileTarget | null>(null)
  const [match, setMatch] = useState<MatchTarget | null>(null)

  const openProfile = useCallback((t: ProfileTarget) => {
    setMatch(null)
    setProfile(t)
  }, [])
  const openMatch = useCallback((t: MatchTarget) => setMatch(t), [])
  const api = useMemo(() => ({ openProfile, openMatch }), [openProfile, openMatch])
  const closeProfile = useCallback(() => setProfile(null), [])
  const closeMatch = useCallback(() => setMatch(null), [])

  return (
    <OverlayContext.Provider value={api}>
      {children}
      {profile && (
        <PlayerProfileModal key={profile.puuid} {...profile} onClose={closeProfile} inert={match !== null} />
      )}
      {match && <MatchView key={match.matchId + match.perspectivePuuid} {...match} onClose={closeMatch} />}
    </OverlayContext.Provider>
  )
}
