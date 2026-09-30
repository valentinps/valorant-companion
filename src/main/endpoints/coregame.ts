// The match in progress ("core-game") on the GLZ host.
import { endpoint } from '../core/endpoint'
import type { PlayerIdentity, SeasonalBadgeInfo } from './common'

export interface CoregamePlayer {
  Subject: string
  TeamID: string
  CharacterID: string
  PlayerIdentity: PlayerIdentity
  SeasonalBadgeInfo: SeasonalBadgeInfo
  IsCoach: boolean
}

export interface CoregameMatch {
  MatchID: string
  State: string
  MapID: string
  ModeID: string
  ProvisioningFlow: string
  MatchmakingData: { QueueID: string; IsRanked: boolean } | null
  Players: CoregamePlayer[]
}

/** Returns 404 when you are not in a match. */
export const getCoregamePlayer = endpoint<{ puuid: string }, { Subject: string; MatchID: string }>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/core-game/v1/players/${p.puuid}`
})

export const getCoregameMatch = endpoint<{ matchId: string }, CoregameMatch>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/core-game/v1/matches/${p.matchId}`
})
