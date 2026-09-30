import { ApiClient } from './core/apiClient'
import { RiotSession } from './core/session'
import { createHandlers, type Handlers } from './handlers'
import type { ServiceContext } from './services/context'
import { FriendsService } from './services/friends'
import { LiveMatchService } from './services/live'
import { MatchDetailService } from './services/matchDetail'
import { MatchRepository } from './services/matchRepository'
import { MatchesService } from './services/matches'
import { PartyService } from './services/party'
import { PlayerDirectory } from './services/players'
import { PlayerStatsService } from './services/playerStats'
import { PregameService } from './services/pregame'
import { ProfileService } from './services/profile'
import { StoreService } from './services/store'
import { GameStateTracker } from './state/gameState'
import { StaticData } from './static/staticData'

export interface Services {
  profile: ProfileService
  pregame: PregameService
  live: LiveMatchService
  party: PartyService
  store: StoreService
  matches: MatchesService
  playerStats: PlayerStatsService
  friends: FriendsService
  matchDetail: MatchDetailService
}

export interface Backend {
  ctx: ServiceContext
  services: Services
  tracker: GameStateTracker
  handlers: Handlers
}

/**
 * Builds the whole backend. Contains no Electron code, so it can also be driven
 * from a plain Node script (see scripts/smoke.ts).
 */
export function createBackend(options: { cacheDir?: string } = {}): Backend {
  const session = new RiotSession()
  const api = new ApiClient(session)
  const players = new PlayerDirectory(api)
  const ctx: ServiceContext = {
    session,
    api,
    players,
    matches: new MatchRepository(api),
    assets: new StaticData(options.cacheDir)
  }

  const services: Services = {
    profile: new ProfileService(ctx),
    pregame: new PregameService(ctx),
    live: new LiveMatchService(ctx),
    party: new PartyService(ctx),
    store: new StoreService(ctx),
    matches: new MatchesService(ctx),
    playerStats: new PlayerStatsService(ctx),
    friends: new FriendsService(ctx),
    matchDetail: new MatchDetailService(ctx)
  }

  const tracker = new GameStateTracker(session, api, (puuid) => players.resolveOne(puuid))
  return { ctx, services, tracker, handlers: createHandlers(services, tracker) }
}
