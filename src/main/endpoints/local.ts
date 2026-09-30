// Local Riot Client API (https://127.0.0.1:{port}), authenticated with the lockfile password.
import { endpoint } from '../core/endpoint'

export interface RawPresence {
  puuid: string
  game_name: string
  game_tag: string
  product: string
  state: string
  /** Base64-encoded JSON with VALORANT-specific state; see state/presence.ts. */
  private: string | null
}

export const getPresences = endpoint<void, { presences: RawPresence[] }>({
  host: 'local',
  method: 'GET',
  path: () => '/chat/v4/presences'
})

export const getRegionLocale = endpoint<void, { region: string; locale: string }>({
  host: 'local',
  method: 'GET',
  path: () => '/riotclient/region-locale'
})

export interface RawFriend {
  puuid: string
  game_name: string
  game_tag: string
  note: string
  last_online_ts: number | null
}

export const getFriends = endpoint<void, { friends: RawFriend[] }>({
  host: 'local',
  method: 'GET',
  path: () => '/chat/v4/friends'
})
