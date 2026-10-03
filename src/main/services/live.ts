import type { LiveMatchView, LiveTeam } from '../../shared/types'
import { isNotFound } from '../core/errors'
import { Coregame } from '../endpoints'
import type { CoregamePlayer } from '../endpoints/coregame'
import type { ServiceContext } from './context'
import { buildSlots } from './players'
import { queueName } from './queues'

/** The match currently being played. */
export class LiveMatchService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Returns null when you are not in a match. */
  async get(): Promise<LiveMatchView | null> {
    const { api, assets, players, ranks, session } = this.ctx
    const { puuid } = session.requireInfo()

    let matchId: string
    try {
      matchId = (await api.call(Coregame.getCoregamePlayer, { puuid })).MatchID
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
    const match = await api.call(Coregame.getCoregameMatch, { matchId })

    const allyTeamId = match.Players.find((p) => p.Subject === puuid)?.TeamID
    const teamIds = [...new Set(match.Players.map((p) => p.TeamID))].sort((a, b) =>
      a === allyTeamId ? -1 : b === allyTeamId ? 1 : 0
    )

    /** The badge only carries a rank in competitive games; elsewhere it's 0, so look the rank up. */
    const competitiveTier = async (p: CoregamePlayer): Promise<number> => {
      const badge = p.SeasonalBadgeInfo?.Rank ?? 0
      if (badge > 0) return badge
      return ranks
        .competitive(p.Subject)
        .then((c) => c.rank.tier)
        .catch(() => 0)
    }

    const teams: LiveTeam[] = await Promise.all(
      teamIds.map(async (teamId) => {
        const members = match.Players.filter((p) => p.TeamID === teamId && !p.IsCoach)
        return {
          teamId,
          isAlly: teamId === allyTeamId,
          players: await buildSlots(
            await Promise.all(
              members.map(async (p) => ({
                puuid: p.Subject,
                identity: p.PlayerIdentity,
                characterId: p.CharacterID,
                selectionState: 'locked' as const,
                tier: await competitiveTier(p)
              }))
            ),
            puuid,
            players,
            assets
          )
        }
      })
    )

    return {
      matchId: match.MatchID,
      map: await assets.map(match.MapID),
      queue: queueName(match.MatchmakingData?.QueueID),
      teams
    }
  }
}
