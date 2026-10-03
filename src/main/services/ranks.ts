import type { RankInfo } from '../../shared/types'
import type { ApiClient } from '../core/apiClient'
import { TtlCache } from '../core/cache'
import { Player } from '../endpoints'
import type { MmrResponse } from '../endpoints/player'
import type { StaticData } from '../static/staticData'

const MMR_TTL = 2 * 60_000

export interface CompetitiveRank {
  rank: RankInfo
  rankedRating: number
}

/**
 * A player's competitive rank, whatever queue they last played.
 * Riot's "latest update" is from the last match in any queue (a deathmatch reads as Unranked),
 * so the rank comes from the current act's competitive record instead.
 */
export class RankDirectory {
  private mmr = new TtlCache<string, MmrResponse>(MMR_TTL)

  constructor(
    private readonly api: ApiClient,
    private readonly assets: StaticData
  ) {}

  getMmr(puuid: string): Promise<MmrResponse> {
    return this.mmr.getOrLoadWithFallback(puuid, () => this.api.call(Player.getMmr, { puuid }))
  }

  async competitive(puuid: string): Promise<CompetitiveRank> {
    return this.fromMmr(await this.getMmr(puuid))
  }

  async fromMmr(mmr: MmrResponse): Promise<CompetitiveRank> {
    const actId = await this.assets.currentActId()
    const acts = Object.values(mmr.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {})
    const thisAct = actId ? acts.find((a) => a.SeasonID.toLowerCase() === actId) : undefined
    if (thisAct) {
      return { rank: await this.assets.rank(thisAct.CompetitiveTier), rankedRating: thisAct.RankedRating }
    }

    // Static data doesn't know the current act (e.g. a brand new one): trust the latest update if it was a comp game.
    const latest = mmr.LatestCompetitiveUpdate
    if (!actId && latest?.QueueID === 'competitive') {
      return { rank: await this.assets.rank(latest.TierAfterUpdate), rankedRating: latest.RankedRatingAfterUpdate }
    }
    return { rank: await this.assets.rank(0), rankedRating: 0 }
  }
}
