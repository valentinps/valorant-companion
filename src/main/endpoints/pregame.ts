// Agent select ("pre-game") on the GLZ host.
import { endpoint } from '../core/endpoint'
import type { PlayerIdentity, SeasonalBadgeInfo } from './common'

export interface PregamePlayer {
  Subject: string
  CharacterID: string
  CharacterSelectionState: '' | 'selected' | 'locked'
  PregamePlayerState: string
  CompetitiveTier: number
  PlayerIdentity: PlayerIdentity
  SeasonalBadgeInfo: SeasonalBadgeInfo
  IsCaptain: boolean
}

export interface PregameTeam {
  TeamID: string
  Players: PregamePlayer[]
}

export interface PregameMatch {
  ID: string
  Version: number
  Teams: PregameTeam[]
  AllyTeam: PregameTeam | null
  EnemyTeam: PregameTeam | null
  PregameState: string
  MapID: string
  Mode: string
  QueueID: string
  ProvisioningFlowID: string
  IsRanked: boolean
  PhaseTimeRemainingNS: number
}

/** Returns 404 when you are not in agent select. */
export const getPregamePlayer = endpoint<{ puuid: string }, { Subject: string; MatchID: string }>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/pregame/v1/players/${p.puuid}`
})

export const getPregameMatch = endpoint<{ matchId: string }, PregameMatch>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/pregame/v1/matches/${p.matchId}`
})

/** Hover an agent. */
export const selectAgent = endpoint<{ matchId: string; agentId: string }, PregameMatch>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/pregame/v1/matches/${p.matchId}/select/${p.agentId}`
})

/**
 * Lock an agent. Must only ever be called in response to a user click.
 * Automating this (instalocking) is against Riot's rules and gets accounts banned.
 */
export const lockAgent = endpoint<{ matchId: string; agentId: string }, PregameMatch>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/pregame/v1/matches/${p.matchId}/lock/${p.agentId}`
})

/** Dodge the match (the normal dodge penalty applies). Not wired into the UI. */
export const quitPregame = endpoint<{ matchId: string }, unknown>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/pregame/v1/matches/${p.matchId}/quit`
})
