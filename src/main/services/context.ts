import type { ApiClient } from '../core/apiClient'
import type { RiotSession } from '../core/session'
import type { StaticData } from '../static/staticData'
import type { MatchRepository } from './matchRepository'
import type { PlayerDirectory } from './players'
import type { RankDirectory } from './ranks'

/** Everything a service needs. Passed to every service constructor. */
export interface ServiceContext {
  session: RiotSession
  api: ApiClient
  assets: StaticData
  players: PlayerDirectory
  ranks: RankDirectory
  matches: MatchRepository
}
