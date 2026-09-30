import type { LiveMatchView, LiveTeam } from '../../shared/types'
import { isNotFound } from '../core/errors'
import { Coregame } from '../endpoints'
import type { ServiceContext } from './context'
import { buildSlots } from './players'
import { queueName } from './queues'

/** The match currently being played. */
export class LiveMatchService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Returns null when you are not in a match. */
  async get(): Promise<LiveMatchView | null> {
    const { api, assets, players, session } = this.ctx
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

    const teams: LiveTeam[] = await Promise.all(
      teamIds.map(async (teamId) => {
        const isAlly = teamId === allyTeamId
        const members = match.Players.filter((p) => p.TeamID === teamId && !p.IsCoach)
        return {
          teamId,
          isAlly,
          players: await buildSlots(
            members.map((p) => ({
              puuid: p.Subject,
              identity: p.PlayerIdentity,
              characterId: p.CharacterID,
              selectionState: 'locked' as const,
              // Ranks are only shown for your own team - no opponent scouting.
              tier: isAlly ? (p.SeasonalBadgeInfo?.Rank ?? 0) : null
            })),
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
