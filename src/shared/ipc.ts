// The typed contract between the UI (renderer) and the backend (main process).
//
// To expose a new feature to the UI:
//   1. add a command here,
//   2. implement it in src/main/handlers.ts (TypeScript will error until you do),
//   3. call it from the UI with `api.invoke('your.command', ...args)`.

import type {
  AppStatus,
  FriendView,
  PlayerProfileView,
  LiveMatchView,
  MatchDetailView,
  MatchSummary,
  PartyView,
  PregameView,
  SavedPlayer,
  ProfileView,
  RemoteMode,
  RemoteView,
  ResourceName,
  StoreView
} from './types'

export interface Commands {
  'status.get': () => AppStatus

  'profile.get': () => ProfileView

  'pregame.get': () => PregameView | null
  /** Hover an agent. Only ever triggered by an explicit user click. */
  'pregame.select': (agentId: string) => void
  /** Lock an agent. Only ever triggered by an explicit user click - never automated. */
  'pregame.lock': (agentId: string) => void

  'live.get': () => LiveMatchView | null

  'party.get': () => PartyView | null
  'party.setReady': (ready: boolean) => void
  'party.changeQueue': (queueId: string) => void
  'party.startQueue': () => void
  'party.stopQueue': () => void
  'party.setOpen': (open: boolean) => void

  'store.get': () => StoreView

  'matches.recent': (count: number) => MatchSummary[]
  /** Full breakdown of a finished match, seen from one player's side. */
  'matches.details': (matchId: string, perspectivePuuid: string) => MatchDetailView

  /** Stats for any player, computed from their recent matches. queue: null = all modes. */
  'players.profile': (puuid: string, queue: string | null, count: number, hidden?: boolean) => PlayerProfileView

  /** Players the user keeps track of, newest first. Local only: makes no Riot requests. */
  'saved.list': () => SavedPlayer[]
  /** hidden: the player is in streamer mode; their name is then never looked up or stored. */
  'saved.add': (puuid: string, hidden?: boolean) => void
  'saved.remove': (puuid: string) => void

  'friends.list': () => FriendView[]
  'friends.invite': (puuid: string) => void
  'friends.requestJoin': (puuid: string) => void

  /** Phone remote: serves this UI to a phone. PC only; phones can't call these. */
  'remote.get': () => RemoteView
  'remote.setEnabled': (enabled: boolean) => RemoteView
  'remote.setMode': (mode: RemoteMode) => RemoteView
  /** Sign out every paired phone. */
  'remote.resetKey': () => RemoteView
}

/** Events pushed from main to the UI. */
export interface Events {
  status: AppStatus
  resource: ResourceName
}

export type CommandName = keyof Commands
export type CommandArgs<K extends CommandName> = Parameters<Commands[K]>
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]>

export interface IpcError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export const COMMAND_CHANNEL_PREFIX = 'cmd:'
export const EVENT_CHANNEL_PREFIX = 'evt:'

/** What the preload script exposes as `window.api`. */
export interface RendererApi {
  invoke<K extends CommandName>(command: K, ...args: CommandArgs<K>): Promise<CommandResult<K>>
  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): () => void
}
