import type { AgentOption, PregameView } from '../../shared/types'
import { AppError, isNotFound } from '../core/errors'
import { Pregame, Store } from '../endpoints'
import type { PregameMatch, PregameTeam } from '../endpoints/pregame'
import type { ServiceContext } from './context'
import { buildSlots } from './players'
import { queueName } from './queues'

/**
 * Agent select. Select/lock are thin wrappers around a single request and are only ever
 * invoked from a button the user clicks. Do not add anything that locks automatically.
 */
export class PregameService {
  private ownedAgents: { puuid: string; ids: Set<string> } | null = null

  constructor(private readonly ctx: ServiceContext) {}

  /** Returns null when you are not in agent select. */
  async get(): Promise<PregameView | null> {
    const { puuid } = this.ctx.session.requireInfo()
    const matchId = await this.currentMatchId()
    if (!matchId) return null
    const match = await this.ctx.api.call(Pregame.getPregameMatch, { matchId })
    return this.toView(match, puuid)
  }

  async select(agentId: string): Promise<void> {
    const matchId = await this.requireMatchId()
    await this.requireOwned(agentId)
    await this.ctx.api.call(Pregame.selectAgent, { matchId, agentId })
  }

  async lock(agentId: string): Promise<void> {
    const matchId = await this.requireMatchId()
    await this.requireOwned(agentId)
    await this.ctx.api.call(Pregame.lockAgent, { matchId, agentId })
  }

  private async currentMatchId(): Promise<string | null> {
    const { puuid } = this.ctx.session.requireInfo()
    try {
      return (await this.ctx.api.call(Pregame.getPregamePlayer, { puuid })).MatchID
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  private async requireMatchId(): Promise<string> {
    const id = await this.currentMatchId()
    if (!id) throw new AppError('INVALID_ACTION', 'You are not in agent select')
    return id
  }

  private async requireOwned(agentId: string): Promise<void> {
    const owned = await this.getOwnedAgentIds()
    if (!owned.has(agentId.toLowerCase())) throw new AppError('INVALID_ACTION', 'You do not own this agent')
  }

  private async getOwnedAgentIds(): Promise<Set<string>> {
    const { puuid } = this.ctx.session.requireInfo()
    if (this.ownedAgents?.puuid === puuid) return this.ownedAgents.ids

    const [owned, agents] = await Promise.all([
      this.ctx.api.call(Store.getOwnedItems, { puuid, itemTypeId: Store.ItemType.Agents }),
      this.ctx.assets.agents()
    ])
    const ids = new Set(owned.Entitlements.map((e) => e.ItemID.toLowerCase()))
    for (const a of agents) if (a.isBaseContent) ids.add(a.id) // starter agents aren't entitlements
    this.ownedAgents = { puuid, ids }
    return ids
  }

  private async toView(match: PregameMatch, puuid: string): Promise<PregameView> {
    const { assets, players } = this.ctx
    const team: PregameTeam | null =
      match.AllyTeam ?? match.Teams?.find((t) => t.Players.some((p) => p.Subject === puuid)) ?? null
    const rawPlayers = team?.Players ?? []

    const slots = await buildSlots(
      rawPlayers.map((p) => ({
        puuid: p.Subject,
        identity: p.PlayerIdentity,
        characterId: p.CharacterID,
        selectionState: p.CharacterSelectionState,
        tier: p.CompetitiveTier
      })),
      puuid,
      players,
      assets
    )

    const lockedBy = new Map<string, string>()
    for (const slot of slots) {
      if (!slot.isSelf && slot.selectionState === 'locked' && slot.agent) {
        lockedBy.set(slot.agent.id, slot.displayName ?? 'A teammate')
      }
    }

    const owned = await this.getOwnedAgentIds()
    const agents: AgentOption[] = (await assets.agents()).map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      role: a.role,
      owned: owned.has(a.id),
      takenBy: lockedBy.get(a.id) ?? null
    }))

    return {
      matchId: match.ID,
      map: await assets.map(match.MapID),
      queue: queueName(match.QueueID),
      state: match.PregameState,
      endsAt: Date.now() + Math.round(match.PhaseTimeRemainingNS / 1e6),
      team: slots,
      self: slots.find((s) => s.isSelf) ?? null,
      agents
    }
  }
}
