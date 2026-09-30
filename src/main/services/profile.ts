import type { ProfileView } from '../../shared/types'
import { Player } from '../endpoints'
import type { ServiceContext } from './context'

export class ProfileService {
  constructor(private readonly ctx: ServiceContext) {}

  async get(): Promise<ProfileView> {
    const { api, assets, players, session } = this.ctx
    const { puuid, region } = session.requireInfo()

    const [player, mmr, xp] = await Promise.all([
      players.resolveOne(puuid),
      api.call(Player.getMmr, { puuid }),
      api.call(Player.getAccountXp, { puuid })
    ])

    const latest = mmr.LatestCompetitiveUpdate
    return {
      player,
      accountLevel: xp.Progress.Level,
      rank: await assets.rank(latest?.TierAfterUpdate ?? 0),
      rankedRating: latest?.RankedRatingAfterUpdate ?? 0,
      region
    }
  }
}
