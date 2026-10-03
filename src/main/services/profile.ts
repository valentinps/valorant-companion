import type { PlayerCardArt, ProfileView } from '../../shared/types'
import { Player } from '../endpoints'
import type { ServiceContext } from './context'

export class ProfileService {
  constructor(private readonly ctx: ServiceContext) {}

  async get(): Promise<ProfileView> {
    const { api, assets, players, ranks, session } = this.ctx
    const { puuid, region } = session.requireInfo()

    const [player, competitive, xp, loadout] = await Promise.all([
      players.resolveOne(puuid),
      ranks.competitive(puuid),
      api.call(Player.getAccountXp, { puuid }),
      api.call(Player.getLoadout, { puuid }).catch(() => null)
    ])
    const identity = loadout?.Identity

    return {
      player,
      accountLevel: xp.Progress.Level,
      rank: competitive.rank,
      rankedRating: competitive.rankedRating,
      region,
      card: identity?.PlayerCardID ? cardArt(identity.PlayerCardID) : null,
      title: identity?.PlayerTitleID ? await assets.title(identity.PlayerTitleID) : null
    }
  }
}

export function cardArt(cardId: string): PlayerCardArt {
  const base = `https://media.valorant-api.com/playercards/${cardId}`
  return { wide: `${base}/wideart.png`, large: `${base}/largeart.png` }
}
