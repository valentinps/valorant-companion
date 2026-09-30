// Raw Riot response fragments shared by several endpoints.

export interface PlayerIdentity {
  Subject: string
  PlayerCardID: string
  PlayerTitleID: string
  AccountLevel: number
  PreferredLevelBorderID: string
  /** Streamer mode: the player's name should not be shown. */
  Incognito: boolean
  HideAccountLevel: boolean
}

export interface SeasonalBadgeInfo {
  SeasonID: string
  NumberOfWins: number
  Rank: number
  LeaderboardRank: number
}
