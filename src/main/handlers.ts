import type { CommandArgs, CommandName, CommandResult, IpcResult } from '../shared/ipc'
import type { Services } from './backend'
import { AppError } from './core/errors'
import type { GameStateTracker } from './state/gameState'

/** One implementation per command in shared/ipc.ts. A missing command is a type error. */
export type Handlers = {
  [K in CommandName]: (...args: CommandArgs<K>) => Promise<CommandResult<K>> | CommandResult<K>
}

/** Matches a saved player's snapshot is computed over; same as the profile window, so it shares its cache. */
const SNAPSHOT_MATCHES = 10
/** Saved players' stats are their competitive form, the profile's default tab. */
const SNAPSHOT_QUEUE = 'competitive'

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

    'players.profile': async (puuid, queue, count, hidden) => {
      const view = await s.playerStats.profile(puuid, queue, count, hidden)
      // Keep saved players' cards up to date with what was just seen.
      if (queue === SNAPSHOT_QUEUE) void s.saved.recordSnapshot(view)
      return view
    },

    'saved.list': () => s.saved.list(),
    'saved.add': async (puuid, hidden = false) => {
      await s.saved.add(puuid, hidden ? null : await s.players.resolveOne(puuid), hidden)
      // Fill the first snapshot in the background; it's usually already cached from the open profile.
      void s.playerStats
        .profile(puuid, SNAPSHOT_QUEUE, SNAPSHOT_MATCHES, hidden)
        .then((view) => s.saved.recordSnapshot(view))
        .catch(() => {})
    },
    'saved.remove': (puuid) => s.saved.remove(puuid),

    'friends.list': () => s.friends.list(),
    'friends.invite': (puuid) => s.friends.invite(puuid),
    'friends.requestJoin': (puuid) => s.friends.requestJoin(puuid),

    'remote.get': () => s.remote.view(),
    'remote.setEnabled': (enabled) => s.remote.setEnabled(enabled),
    'remote.setMode': (mode) => s.remote.setMode(mode),
    'remote.resetKey': () => s.remote.resetKey()
  }
}

/** Runs a command for IPC or the phone remote. Errors are returned as data so the UI gets a clean message. */
export async function runCommand(handlers: Handlers, command: string, args: unknown[]): Promise<IpcResult<unknown>> {
  const handler = (handlers as Record<string, ((...a: unknown[]) => unknown) | undefined>)[command]
  if (!Object.hasOwn(handlers, command) || !handler) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `Unknown command: ${command}` } }
  }
  try {
    const data = await handler(...args)
    return { ok: true, data: data ?? null }
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'UNKNOWN'
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[command] ${command} failed:`, message)
    return { ok: false, error: { code, message } }
  }
}
