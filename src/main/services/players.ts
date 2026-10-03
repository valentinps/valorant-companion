import type { PlayerRef, SelectionState, TeamSlot } from '../../shared/types'
import type { ApiClient } from '../core/apiClient'
import { Player } from '../endpoints'
import type { PlayerIdentity } from '../endpoints/common'
import type { StaticData } from '../static/staticData'

/** Resolves PUUIDs to Riot IDs, with a cache (names rarely change during a session). */
export class PlayerDirectory {
  private cache = new Map<string, PlayerRef>()

  constructor(private readonly api: ApiClient) {}

  async resolve(puuids: string[]): Promise<Map<string, PlayerRef>> {
    const missing = [...new Set(puuids)].filter((id) => !this.cache.has(id))
    if (missing.length > 0) {
      const entries = await this.api.call(Player.getNames, { puuids: missing })
      for (const e of entries) {
        this.cache.set(e.Subject, { puuid: e.Subject, gameName: e.GameName, tagLine: e.TagLine })
      }
    }
    const result = new Map<string, PlayerRef>()
    for (const id of puuids) {
      const ref = this.cache.get(id)
      if (ref) result.set(id, ref)
    }
    return result
  }

  async resolveOne(puuid: string): Promise<PlayerRef> {
    const ref = (await this.resolve([puuid])).get(puuid)
    return ref ?? { puuid, gameName: 'Unknown', tagLine: '' }
  }
}

export interface SlotInput {
  puuid: string
  identity: PlayerIdentity
  characterId: string
  selectionState: SelectionState
  /** Competitive tier to show, or null to not show a rank. */
  tier: number | null
}

/**
 * Builds display slots for a list of players.
 * Respects streamer mode: an incognito player's name is never revealed (unless it's you).
 */
export async function buildSlots(
  inputs: SlotInput[],
  selfPuuid: string,
  players: PlayerDirectory,
  assets: StaticData
): Promise<TeamSlot[]> {
  const visible = inputs.filter((i) => i.puuid === selfPuuid || !i.identity.Incognito).map((i) => i.puuid)
  const names = await players.resolve(visible).catch(() => new Map<string, PlayerRef>())

  return Promise.all(
    inputs.map(async (i): Promise<TeamSlot> => {
      const isSelf = i.puuid === selfPuuid
      const ref = names.get(i.puuid)
      const agent = i.characterId ? await assets.agent(i.characterId) : null
      return {
        puuid: i.puuid,
        displayName: ref?.gameName ? `${ref.gameName}#${ref.tagLine}` : null,
        isSelf,
        agent: agent ? { id: agent.id, name: agent.name, icon: agent.icon } : null,
        selectionState: i.selectionState,
        accountLevel: i.identity.HideAccountLevel && !isSelf ? null : i.identity.AccountLevel,
        rank: i.tier !== null ? await assets.rank(i.tier) : null
      }
    })
  )
}
