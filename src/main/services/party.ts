import type { PartyMember, PartyView, PlayerRef } from '../../shared/types'
import { AppError, isNotFound } from '../core/errors'
import { Party } from '../endpoints'
import type { Party as RawParty } from '../endpoints/party'
import type { ServiceContext } from './context'
import { queueName } from './queues'

export class PartyService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Returns null when the game isn't open (no party exists). */
  async get(): Promise<PartyView | null> {
    const partyId = await this.currentPartyId()
    if (!partyId) return null
    return this.toView(await this.ctx.api.call(Party.getParty, { partyId }))
  }

  async setReady(ready: boolean): Promise<void> {
    const { puuid } = this.ctx.session.requireInfo()
    await this.ctx.api.call(Party.setReady, { partyId: await this.requirePartyId(), puuid, ready })
  }

  async changeQueue(queueId: string): Promise<void> {
    await this.ctx.api.call(Party.changeQueue, { partyId: await this.requirePartyId(), queueId })
  }

  async startQueue(): Promise<void> {
    await this.ctx.api.call(Party.joinQueue, { partyId: await this.requirePartyId() })
  }

  async stopQueue(): Promise<void> {
    await this.ctx.api.call(Party.leaveQueue, { partyId: await this.requirePartyId() })
  }

  async setOpen(open: boolean): Promise<void> {
    await this.ctx.api.call(Party.setAccessibility, {
      partyId: await this.requirePartyId(),
      accessibility: open ? 'OPEN' : 'CLOSED'
    })
  }

  private async currentPartyId(): Promise<string | null> {
    const { puuid } = this.ctx.session.requireInfo()
    try {
      return (await this.ctx.api.call(Party.getPartyPlayer, { puuid })).CurrentPartyID
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  private async requirePartyId(): Promise<string> {
    const id = await this.currentPartyId()
    if (!id) throw new AppError('INVALID_ACTION', 'Open VALORANT to manage your party')
    return id
  }

  private async toView(party: RawParty): Promise<PartyView> {
    const { assets, players, session } = this.ctx
    const { puuid } = session.requireInfo()
    const visible = party.Members.filter((m) => m.Subject === puuid || !m.PlayerIdentity.Incognito).map(
      (m) => m.Subject
    )
    const names = await players.resolve(visible).catch(() => new Map<string, PlayerRef>())

    const members: PartyMember[] = await Promise.all(
      party.Members.map(async (m) => {
        const ref = names.get(m.Subject)
        const isSelf = m.Subject === puuid
        const pings = m.Pings?.map((p) => p.Ping).filter((p) => p > 0) ?? []
        return {
          puuid: m.Subject,
          displayName: ref ? `${ref.gameName}#${ref.tagLine}` : null,
          isSelf,
          isOwner: m.IsOwner === true,
          isReady: m.IsReady,
          accountLevel: m.PlayerIdentity.HideAccountLevel && !isSelf ? null : m.PlayerIdentity.AccountLevel,
          rank: await assets.rank(m.CompetitiveTier),
          ping: pings.length > 0 ? Math.min(...pings) : null
        }
      })
    )

    const queueId = party.MatchmakingData?.QueueID ?? ''
    return {
      partyId: party.ID,
      state: party.State,
      isMatchmaking: party.State === 'MATCHMAKING',
      queueId,
      queueName: queueName(queueId),
      eligibleQueues: (party.EligibleQueues ?? []).map((id) => ({ id, name: queueName(id) })),
      accessibility: party.Accessibility,
      isSelfOwner: members.some((m) => m.isSelf && m.isOwner),
      members
    }
  }
}
