// Player data on the PD host: names, rank, XP, match history.
import { endpoint } from '../core/endpoint'

export interface NameServiceEntry {
  Subject: string
  GameName: string
  TagLine: string
  DisplayName: string
}

/** Resolve PUUIDs to Riot IDs. */
export const getNames = endpoint<{ puuids: string[] }, NameServiceEntry[]>({
  host: 'pd',
  method: 'PUT',
  path: () => '/name-service/v2/players',
  body: (p) => p.puuids
})

export interface CompetitiveUpdate {
  MatchID: string
  MapID: string
  QueueID?: string
  SeasonID: string
  MatchStartTime: number
  MatchLength?: number
  TierAfterUpdate: number
  TierBeforeUpdate: number
  RankedRatingAfterUpdate: number
  RankedRatingBeforeUpdate: number
  RankedRatingEarned: number
  RankedRatingPerformanceBonus: number
}

export interface MmrResponse {
  Subject: string
  /** Hides the act rank badge (best-wins triangle) on the player card; the rank itself stays public. */
  IsActRankBadgeHidden?: boolean
  LatestCompetitiveUpdate: CompetitiveUpdate | null
  QueueSkills: Record<
    string,
    {
      SeasonalInfoBySeasonID: Record<
        string,
        {
          SeasonID: string
          NumberOfGames: number
          NumberOfWins: number
          /** Rank at the end of the act (or now, for the current act). */
          CompetitiveTier: number
          RankedRating: number
          /** Wins per tier, e.g. { "18": 9, "19": 6 }; the highest key is the best rank won at. */
          WinsByTier: Record<string, number> | null
          Rank: number
        }
      > | null
    }
  >
}

export const getMmr = endpoint<{ puuid: string }, MmrResponse>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/mmr/v1/players/${p.puuid}`
})

type PageParams = { puuid: string; start: number; end: number; queue?: string }

const page = (p: PageParams) =>
  `startIndex=${p.start}&endIndex=${p.end}` + (p.queue ? `&queue=${encodeURIComponent(p.queue)}` : '')

export const getCompetitiveUpdates = endpoint<PageParams, { Subject: string; Matches: CompetitiveUpdate[] }>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/mmr/v1/players/${p.puuid}/competitiveupdates?${page(p)}`
})

export const getMatchHistory = endpoint<
  PageParams,
  { Subject: string; Total: number; History: { MatchID: string; GameStartTime: number; QueueID: string }[] }
>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/match-history/v1/history/${p.puuid}?${page(p)}`
})

/** Subset of the match details response that the app uses. */
export interface MatchDetails {
  matchInfo: {
    matchId: string
    mapId: string
    queueID: string
    isRanked: boolean
    gameStartMillis: number
    gameLengthMillis: number | null
    completionState: string
  }
  players: {
    subject: string
    gameName: string
    tagLine: string
    teamId: string
    partyId: string
    characterId: string
    competitiveTier: number
    accountLevel: number
    playerCard: string
    stats: { score: number; roundsPlayed: number; kills: number; deaths: number; assists: number } | null
  }[]
  teams: { teamId: string; won: boolean; roundsPlayed: number; roundsWon: number; numPoints: number }[] | null
  roundResults: MatchRound[] | null
  /** Not in the community docs, but present in current responses. */
  matchMvp?: string
}

export interface MatchKill {
  roundTime: number
  killer: string
  victim: string
  assistants: string[]
  finishingDamage: { damageType: string; damageItem: string; isSecondaryFireMode: boolean }
}

export interface MatchRound {
  roundNum: number
  /** "Eliminated" | "Bomb detonated" | "Bomb defused" | "Surrendered" | "Round timer expired" */
  roundResult: string
  roundResultCode: string
  roundCeremony: string
  winningTeam: string
  /** "Attacker" | "Defender"; not in the community docs, present in current responses. */
  winningTeamRole?: string
  firstBloodPlayer?: string
  /** Player the ceremony (ace, clutch...) is credited to. */
  ceremonyPlayer?: string
  bombPlanter?: string
  bombDefuser?: string
  plantSite: string
  plantRoundTime?: number
  defuseRoundTime?: number
  playerStats: {
    subject: string
    kills: MatchKill[] | null
    damage: { receiver: string; damage: number; legshots: number; bodyshots: number; headshots: number }[] | null
    score: number
    economy: { loadoutValue: number; weapon: string; armor: string; remaining: number; spent: number } | null
  }[]
}

/** Full match details (all players, rounds, kills). Large response; immutable once the match is over. */
export const getMatchDetails = endpoint<{ matchId: string }, MatchDetails>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/match-details/v1/matches/${p.matchId}`
})

export const getAccountXp = endpoint<{ puuid: string }, { Subject: string; Progress: { Level: number; XP: number } }>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/account-xp/v1/players/${p.puuid}`
})
