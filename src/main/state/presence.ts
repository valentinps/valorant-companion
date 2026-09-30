import type { RawPresence } from '../endpoints/local'

export type LoopState = 'MENUS' | 'PREGAME' | 'INGAME'

/** Everything VALORANT shares about a player through presence (you and your friends). */
export interface ValorantPresence {
  loopState: LoopState
  partyId: string | null
  queueId: string | null
  partySize: number
  maxPartySize: number
  partyAccessibility: 'OPEN' | 'CLOSED'
  /** e.g. "/Game/Maps/Ascent/Ascent"; set during agent select and matches. */
  mapUrl: string | null
  scoreAlly: number | null
  scoreEnemy: number | null
  competitiveTier: number | null
  accountLevel: number | null
  isIdle: boolean
}

// Newer clients nest most fields; older ones kept them flat. Both are read.
interface PrivatePresence {
  isIdle?: boolean
  sessionLoopState?: string
  partyId?: string
  queueId?: string
  partySize?: number
  maxPartySize?: number
  partyAccessibility?: string
  matchMap?: string
  partyOwnerMatchMap?: string
  partyOwnerMatchScoreAllyTeam?: number
  partyOwnerMatchScoreEnemyTeam?: number
  competitiveTier?: number
  accountLevel?: number
  matchPresenceData?: { sessionLoopState?: string; queueId?: string; matchMap?: string }
  partyPresenceData?: {
    partyId?: string
    partySize?: number
    maxPartySize?: number
    partyAccessibility?: string
    partyOwnerMatchMap?: string
  }
  playerPresenceData?: { competitiveTier?: number; accountLevel?: number }
}

/** Decodes the base64 `private` blob VALORANT attaches to a presence. */
export function decodeValorantPresence(presence: RawPresence): ValorantPresence | null {
  if (presence.product !== 'valorant' || !presence.private) return null
  let d: PrivatePresence
  try {
    d = JSON.parse(Buffer.from(presence.private, 'base64').toString('utf8'))
  } catch {
    return null
  }
  const loop = d.matchPresenceData?.sessionLoopState ?? d.sessionLoopState
  if (loop !== 'MENUS' && loop !== 'PREGAME' && loop !== 'INGAME') return null

  const party = d.partyPresenceData
  const accessibility = party?.partyAccessibility ?? d.partyAccessibility
  const map = d.matchPresenceData?.matchMap || d.matchMap || party?.partyOwnerMatchMap || d.partyOwnerMatchMap || null
  const inMatch = loop === 'INGAME'

  return {
    loopState: loop,
    partyId: party?.partyId ?? d.partyId ?? null,
    queueId: d.matchPresenceData?.queueId ?? d.queueId ?? null,
    partySize: party?.partySize ?? d.partySize ?? 1,
    maxPartySize: party?.maxPartySize ?? d.maxPartySize ?? 5,
    partyAccessibility: accessibility === 'OPEN' ? 'OPEN' : 'CLOSED',
    mapUrl: map,
    scoreAlly: inMatch ? (d.partyOwnerMatchScoreAllyTeam ?? null) : null,
    scoreEnemy: inMatch ? (d.partyOwnerMatchScoreEnemyTeam ?? null) : null,
    competitiveTier: d.playerPresenceData?.competitiveTier ?? d.competitiveTier ?? null,
    accountLevel: d.playerPresenceData?.accountLevel ?? d.accountLevel ?? null,
    isIdle: d.isIdle === true
  }
}

export function findOwnPresence(presences: RawPresence[], puuid: string): ValorantPresence | null {
  for (const p of presences) {
    if (p.puuid !== puuid) continue
    const decoded = decodeValorantPresence(p)
    if (decoded) return decoded
  }
  return null
}
