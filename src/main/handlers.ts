import type { CommandArgs, CommandName, CommandResult } from '../shared/ipc'
import type { Services } from './backend'
import type { GameStateTracker } from './state/gameState'

/** One implementation per command in shared/ipc.ts. A missing command is a type error. */
export type Handlers = {
  [K in CommandName]: (...args: CommandArgs<K>) => Promise<CommandResult<K>> | CommandResult<K>
}

export function createHandlers(s: Services, tracker: GameStateTracker): Handlers {
  return {
    'status.get': () => tracker.status,

    'profile.get': () => s.profile.get(),

    'pregame.get': () => s.pregame.get(),
    'pregame.select': (agentId) => s.pregame.select(agentId),
    'pregame.lock': (agentId) => s.pregame.lock(agentId),

    'live.get': () => s.live.get(),

    'party.get': () => s.party.get(),
    'party.setReady': (ready) => s.party.setReady(ready),
    'party.changeQueue': (queueId) => s.party.changeQueue(queueId),
    'party.startQueue': () => s.party.startQueue(),
    'party.stopQueue': () => s.party.stopQueue(),
    'party.setOpen': (open) => s.party.setOpen(open),

    'store.get': () => s.store.get(),

    'matches.recent': (count) => s.matches.recent(count),
    'matches.details': (matchId, perspectivePuuid) => s.matchDetail.get(matchId, perspectivePuuid),

    'players.profile': (puuid, queue, count) => s.playerStats.profile(puuid, queue, count),

    'friends.list': () => s.friends.list(),
    'friends.invite': (puuid) => s.friends.invite(puuid),
    'friends.requestJoin': (puuid) => s.friends.requestJoin(puuid)
  }
}
