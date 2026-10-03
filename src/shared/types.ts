// View models sent from the main process to the UI.
// These are shaped for display, not mirrors of Riot's raw responses (those live in src/main/endpoints).

export type GamePhase =
  | 'DISCONNECTED' // Riot Client not running / not reachable
  | 'GAME_CLOSED' // Riot Client running, VALORANT not open
  | 'MENUS'
  | 'PREGAME' // agent select
  | 'INGAME'

export interface PlayerRef {
  puuid: string
  gameName: string
  tagLine: string
}

export interface AppStatus {
  phase: GamePhase
  player: PlayerRef | null
  region: string | null
  shard: string | null
  clientVersion: string | null
  partyId: string | null
  error: string | null
}

/** A Riot resource that changed server-side; UI panels refetch when their resource changes. */
export type ResourceName = 'pregame' | 'party' | 'coregame' | 'friends' | 'saved' | 'remote'

export interface RankInfo {
  tier: number
  name: string
  icon: string | null
  color: string | null
}

/** Art for an equipped player card. */
export interface PlayerCardArt {
  /** Wide banner, as on the in-game scoreboard. */
  wide: string
  /** Tall portrait. */
  large: string
}

export interface ProfileView {
  player: PlayerRef
  accountLevel: number
  rank: RankInfo
  rankedRating: number
  region: string
  /** Equipped card and title; null when Riot didn't return the loadout. */
  card: PlayerCardArt | null
  title: string | null
}

export interface AgentOption {
  id: string
  name: string
  icon: string
  role: string | null
  owned: boolean
  /** Locked by another player on your team. */
  takenBy: string | null
}

export type SelectionState = '' | 'selected' | 'locked'

export interface TeamSlot {
  puuid: string
  /** null when the player has streamer mode (incognito) enabled. */
  displayName: string | null
  isSelf: boolean
  agent: { id: string; name: string; icon: string } | null
  selectionState: SelectionState
  accountLevel: number | null
  rank: RankInfo | null
}

export interface MapInfo {
  id: string
  name: string
  splash: string | null
  icon: string | null
}

export interface PregameView {
  matchId: string
  map: MapInfo
  queue: string
  state: string
  /** ms timestamp at which agent select ends (computed locally from PhaseTimeRemainingNS). */
  endsAt: number
  team: TeamSlot[]
  self: TeamSlot | null
  agents: AgentOption[]
}

export interface LiveTeam {
  teamId: string
  isAlly: boolean
  players: TeamSlot[]
}

export interface LiveMatchView {
  matchId: string
  map: MapInfo
  queue: string
  teams: LiveTeam[]
}

export interface PartyMember {
  puuid: string
  displayName: string | null
  isSelf: boolean
  isOwner: boolean
  isReady: boolean
  accountLevel: number | null
  rank: RankInfo | null
  ping: number | null
}

export interface PartyView {
  partyId: string
  state: string
  isMatchmaking: boolean
  queueId: string
  queueName: string
  eligibleQueues: { id: string; name: string }[]
  accessibility: 'OPEN' | 'CLOSED'
  isSelfOwner: boolean
  members: PartyMember[]
}

export interface Price {
  currency: string
  amount: number
  icon: string | null
}

export interface StoreItem {
  offerId: string
  name: string
  icon: string | null
  price: Price
  /** Night market only. */
  discountedPrice?: Price
  discountPercent?: number
  rarityColor: string | null
}

export interface StoreView {
  wallet: Price[]
  daily: { items: StoreItem[]; refreshesAt: number }
  nightMarket: { items: StoreItem[]; endsAt: number } | null
}

export interface MatchSummary {
  matchId: string
  map: MapInfo
  queue: string
  startedAt: number
  durationMs: number
  rrChange: number | null
  rankAfter: RankInfo | null
  rrAfter: number | null
}

// ---------- Player profiles ----------

export interface AgentUsage {
  agent: { id: string; name: string; icon: string }
  games: number
  wins: number
  kd: number
}

export type MatchOutcome = 'win' | 'loss' | 'draw'

export interface ProfileMatch {
  matchId: string
  map: MapInfo
  queue: string
  startedAt: number
  agent: { id: string; name: string; icon: string } | null
  outcome: MatchOutcome
  /** "13-11"; null for modes without two teams (deathmatch). */
  score: string | null
  kills: number
  deaths: number
  assists: number
  acs: number
  headshotPct: number | null
  rrChange: number | null
}

export interface ProfileStats {
  matches: number
  wins: number
  winRate: number
  kd: number
  kda: { kills: number; deaths: number; assists: number }
  acs: number
  adr: number | null
  headshotPct: number | null
}

export interface PeakRank {
  /** Named as it was in that act. */
  rank: RankInfo
  /** e.g. "V26 Act V" */
  act: string
  actStart: number | null
  actEnd: number | null
  /** Exact day the rank was reached, when it's recent enough for Riot's history to show it. */
  reachedAt: number | null
  /** How many acts this rank was reached in. */
  timesReached: number
}

export interface PlayerProfileView {
  puuid: string
  /** null for a player in streamer mode: their name is never looked up. */
  player: PlayerRef | null
  isSelf: boolean
  cardImage: string | null
  accountLevel: number | null
  /** null when Riot didn't return rank data. */
  rank: RankInfo | null
  rankedRating: number | null
  /** Riot didn't return the rank this time (usually rate limiting). */
  rankUnavailable: boolean
  /** Highest competitive rank across all acts; null if never ranked or unavailable. */
  peakRank: PeakRank | null
  stats: ProfileStats | null
  topAgents: AgentUsage[]
  matches: ProfileMatch[]
  /** null when the player is hidden (tracker.gg needs their Riot ID). */
  trackerUrl: string | null
}

// ---------- Saved players ----------

/** What a saved player looked like the last time their profile was loaded (competitive tab). */
export interface SavedSnapshot {
  at: number
  cardImage: string | null
  accountLevel: number | null
  rank: RankInfo | null
  rankedRating: number | null
  peakRank: RankInfo | null
  stats: ProfileStats | null
  mainAgent: { id: string; name: string; icon: string } | null
}

export interface SavedPlayer {
  puuid: string
  /** null when saved from streamer mode: the name is never looked up. */
  player: PlayerRef | null
  hidden: boolean
  savedAt: number
  snapshot: SavedSnapshot | null
}

// ---------- Friends ----------

export type FriendStatus = 'in-game' | 'online' | 'away' | 'mobile' | 'offline'

export interface FriendActivity {
  loopState: 'MENUS' | 'PREGAME' | 'INGAME'
  queue: string
  map: string | null
  /** "7-5" while in a match. */
  score: string | null
  partySize: number
  maxPartySize: number
  partyOpen: boolean
  rank: RankInfo | null
  accountLevel: number | null
  isIdle: boolean
}

export interface FriendView {
  puuid: string
  gameName: string
  tagLine: string
  note: string
  status: FriendStatus
  /** Riot product they are on: "valorant", "league_of_legends", "riot_client"... */
  product: string | null
  valorant: FriendActivity | null
  lastOnline: number | null
  canInvite: boolean
  canRequestJoin: boolean
}

// ---------- Match details ----------

export interface MatchAgentRef {
  id: string
  name: string
  icon: string
}

export interface MatchPlayerLine {
  puuid: string
  displayName: string
  teamId: string
  agent: MatchAgentRef | null
  /** Rank at the time of the match. */
  rank: RankInfo | null
  accountLevel: number
  acs: number
  kills: number
  deaths: number
  assists: number
  /** Kills minus deaths. */
  plusMinus: number
  adr: number | null
  headshotPct: number | null
  firstKills: number
  firstDeaths: number
  plants: number
  defuses: number
  /** Rounds with 3+ kills. */
  multiKills: number
  /** Players who queued together share a number; null for solo players. */
  partyGroup: number | null
  isPerspective: boolean
  isMatchMvp: boolean
  isTeamMvp: boolean
}

export interface MatchTeamLine {
  teamId: string
  won: boolean
  roundsWon: number
  isPerspective: boolean
  players: MatchPlayerLine[]
}

export interface KillEvent {
  timeMs: number
  killer: { puuid: string; displayName: string; agent: MatchAgentRef | null; teamId: string } | null
  victim: { puuid: string; displayName: string; agent: MatchAgentRef | null; teamId: string }
  /** Weapon, ability or "Spike". */
  cause: { name: string; icon: string | null } | null
  assists: number
  isFirstBlood: boolean
}

export type BuyType = 'Pistol' | 'Eco' | 'Semi-eco' | 'Semi-buy' | 'Full buy'

export interface RoundLine {
  number: number
  winningTeamId: string
  /** Team that attacked this round, when known. */
  attackingTeamId: string | null
  result: string
  /** "Ace", "Clutch", "Flawless"... */
  ceremony: string | null
  ceremonyPlayer: string | null
  plant: { site: string; timeMs: number; by: string | null } | null
  defuse: { timeMs: number; by: string | null } | null
  economy: { teamId: string; loadoutValue: number; spent: number; buyType: BuyType }[]
  kills: KillEvent[]
}

export interface MatchDetailView {
  matchId: string
  map: MapInfo
  queue: string
  startedAt: number
  durationMs: number
  isRanked: boolean
  /** "Completed", "Surrendered"... */
  completion: string
  perspectivePuuid: string
  outcome: MatchOutcome | null
  teams: MatchTeamLine[]
  rounds: RoundLine[]
}

// ---------- Phone remote ----------

export interface RemoteLink {
  /** Network adapter the address belongs to, e.g. "Wi-Fi". */
  label: string
  /** Full pairing link, key included. */
  url: string
  /** QR code of the link, as an SVG document. */
  qrSvg: string
}

export type RemoteMode = 'internet' | 'lan'

export type TunnelState = 'off' | 'downloading' | 'starting' | 'ready' | 'error'

export interface RemoteView {
  enabled: boolean
  mode: RemoteMode
  /** Internet mode only. progress: 0-100 while cloudflared downloads (first use). */
  tunnel: { state: TunnelState; progress: number | null; error: string | null }
  running: boolean
  port: number | null
  error: string | null
  /** Phones currently connected. */
  connectedClients: number
  /** Last request from another device since the server started; null if none ever reached this PC. */
  lastVisit: { address: string; at: number } | null
  /** Internet mode: the tunnel address, once ready. LAN mode: one per network address of this PC, best first. */
  links: RemoteLink[]
}
