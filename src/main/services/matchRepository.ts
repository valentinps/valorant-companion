import type { ApiClient } from '../core/apiClient'
import { TtlCache } from '../core/cache'
import { Player } from '../endpoints'
import type { MatchDetails } from '../endpoints/player'

/**
 * Shared, cached access to match details. Finished matches never change, so they are kept
 * for the whole session; profiles and the match view reuse the same downloads.
 */
export class MatchRepository {
  private cache = new TtlCache<string, MatchDetails>(Infinity, 300)

  constructor(private readonly api: ApiClient) {}

  get(matchId: string): Promise<MatchDetails> {
    return this.cache.getOrLoad(matchId, () => this.api.call(Player.getMatchDetails, { matchId }))
  }
}
