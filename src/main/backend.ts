import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiClient } from './core/apiClient'
import { RiotSession } from './core/session'
import { createHandlers, runCommand, type Handlers } from './handlers'
import { RemoteServer, type UiSource } from './remote/server'
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
import { RankDirectory } from './services/ranks'
import { SavedPlayersService } from './services/savedPlayers'
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
  saved: SavedPlayersService
  players: PlayerDirectory
  remote: RemoteServer
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
export function createBackend(
  options: {
    cacheDir?: string
    savedPlayersFile?: string
    remoteSettingsFile?: string
    remoteUi?: UiSource
    /** Where helper programs (cloudflared) are downloaded to. */
    toolsDir?: string
  } = {}
): Backend {
  const session = new RiotSession()
  const api = new ApiClient(session)
  const players = new PlayerDirectory(api)
  const assets = new StaticData(options.cacheDir)
  const ctx: ServiceContext = {
    session,
    api,
    players,
    ranks: new RankDirectory(api, assets),
    matches: new MatchRepository(api),
    assets
  }

  const tracker = new GameStateTracker(session, api, (puuid) => players.resolveOne(puuid))

  const services: Services = {
    profile: new ProfileService(ctx),
    pregame: new PregameService(ctx),
    live: new LiveMatchService(ctx),
    party: new PartyService(ctx),
    store: new StoreService(ctx),
    matches: new MatchesService(ctx),
    playerStats: new PlayerStatsService(ctx),
    friends: new FriendsService(ctx),
    matchDetail: new MatchDetailService(ctx),
    saved: new SavedPlayersService(options.savedPlayersFile, () => tracker.emit('resource', 'saved')),
    players,
    remote: new RemoteServer({
      tracker,
      ui: options.remoteUi,
      settingsFile: options.remoteSettingsFile,
      toolsDir: options.toolsDir ?? join(tmpdir(), 'valorant-companion-tools'),
      // The phone runs the very same commands as the desktop window.
      dispatch: (command, args) => runCommand(handlers, command, args),
      onChange: () => tracker.emit('resource', 'remote')
    })
  }

  const handlers = createHandlers(services, tracker)
  return { ctx, services, tracker, handlers }
}
