// Party and matchmaking on the GLZ host. Requires the game to be open.
import { endpoint } from '../core/endpoint'
import type { PlayerIdentity } from './common'

export interface PartyMemberRaw {
  Subject: string
  CompetitiveTier: number
  PlayerIdentity: PlayerIdentity
  IsOwner?: boolean
  IsReady: boolean
  Pings: { Ping: number; GamePodID: string }[]
}

export interface Party {
  ID: string
  Version: number
  Members: PartyMemberRaw[]
  /** "DEFAULT" in the lobby, "MATCHMAKING" while queueing, etc. */
  State: string
  Accessibility: 'OPEN' | 'CLOSED'
  MatchmakingData: { QueueID: string; PreferredGamePods: string[] }
  EligibleQueues: string[]
}

type PartyParams = { partyId: string }

export const getPartyPlayer = endpoint<{ puuid: string }, { Subject: string; CurrentPartyID: string }>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/parties/v1/players/${p.puuid}`
})

export const getParty = endpoint<PartyParams, Party>({
  host: 'glz',
  method: 'GET',
  path: (p) => `/parties/v1/parties/${p.partyId}`
})

export const setReady = endpoint<PartyParams & { puuid: string; ready: boolean }, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/members/${p.puuid}/setReady`,
  body: (p) => ({ ready: p.ready })
})

export const changeQueue = endpoint<PartyParams & { queueId: string }, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/queue`,
  body: (p) => ({ queueID: p.queueId })
})

export const joinQueue = endpoint<PartyParams, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/matchmaking/join`
})

export const leaveQueue = endpoint<PartyParams, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/matchmaking/leave`
})

export const setAccessibility = endpoint<PartyParams & { accessibility: 'OPEN' | 'CLOSED' }, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/accessibility`,
  body: (p) => ({ accessibility: p.accessibility })
})

/** Invite a player to your party by Riot ID. */
export const inviteByName = endpoint<PartyParams & { gameName: string; tagLine: string }, Party>({
  host: 'glz',
  method: 'POST',
  path: (p) =>
    `/parties/v1/parties/${p.partyId}/invites/name/${encodeURIComponent(p.gameName)}/tag/${encodeURIComponent(p.tagLine)}`
})

/** Ask to join someone else's party. The party leader gets a request to accept. */
export const requestToJoin = endpoint<PartyParams & { puuid: string }, unknown>({
  host: 'glz',
  method: 'POST',
  path: (p) => `/parties/v1/parties/${p.partyId}/request`,
  body: (p) => ({ Subjects: [p.puuid] })
})
