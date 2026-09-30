import type { MatchSummary } from '../../shared/types'
import { Player } from '../endpoints'
import type { ServiceContext } from './context'
import { queueName } from './queues'

export class MatchesService {
  constructor(private readonly ctx: ServiceContext) {}

  async recent(count: number): Promise<MatchSummary[]> {
    const { api, assets, session } = this.ctx
    const { puuid } = session.requireInfo()
    const safeCount = Math.min(Math.max(1, Math.floor(count)), 20)
    const { Matches } = await api.call(Player.getCompetitiveUpdates, { puuid, start: 0, end: safeCount })

    return Promise.all(
      Matches.map(async (m): Promise<MatchSummary> => {
        const ranked = m.QueueID === 'competitive'
        return {
          matchId: m.MatchID,
          map: await assets.map(m.MapID),
          queue: queueName(m.QueueID),
          startedAt: m.MatchStartTime,
          durationMs: m.MatchLength ?? 0,
          rrChange: ranked ? m.RankedRatingEarned : null,
          rankAfter: ranked ? await assets.rank(m.TierAfterUpdate) : null,
          rrAfter: ranked ? m.RankedRatingAfterUpdate : null
        }
      })
    )
  }
}
