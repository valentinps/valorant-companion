import type { FriendStatus, FriendView } from '../../shared/types'
import { AppError } from '../core/errors'
import { Local, Party } from '../endpoints'
import type { RawPresence } from '../endpoints/local'
import { decodeValorantPresence, findOwnPresence, type ValorantPresence } from '../state/presence'
import type { ServiceContext } from './context'
import { queueName } from './queues'

// Which presence to show when a friend is on several Riot products at once.
const PRODUCT_PRIORITY = ['valorant', 'league_of_legends', 'bacon', 'lion', 'riot_client']

const STATUS_ORDER: FriendStatus[] = ['in-game', 'online', 'away', 'mobile', 'offline']

export class FriendsService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(): Promise<FriendView[]> {
    const { api, assets, session } = this.ctx
    const { puuid: selfPuuid } = session.requireInfo()
    const [{ friends }, { presences }] = await Promise.all([api.call(Local.getFriends), api.call(Local.getPresences)])

    const byPuuid = new Map<string, RawPresence[]>()
    for (const p of presences) byPuuid.set(p.puuid, [...(byPuuid.get(p.puuid) ?? []), p])

    const self = findOwnPresence(presences, selfPuuid)
    const selfCanInvite = self !== null && self.partySize < self.maxPartySize

    const views = await Promise.all(
      friends.map(async (f): Promise<FriendView> => {
        const presence = pickPresence(byPuuid.get(f.puuid) ?? [])
        const val = presence ? decodeValorantPresence(presence) : null
        const status = toStatus(presence, val)
        const inMyParty = val !== null && self !== null && val.partyId === self.partyId

        return {
          puuid: f.puuid,
          gameName: f.game_name,
          tagLine: f.game_tag,
          note: f.note,
          status,
          product: presence?.product ?? null,
          lastOnline: f.last_online_ts,
          valorant: val && {
            loopState: val.loopState,
            queue: queueName(val.queueId),
            map: val.mapUrl ? (await assets.map(val.mapUrl)).name : null,
            score: val.scoreAlly !== null && val.scoreEnemy !== null ? `${val.scoreAlly}-${val.scoreEnemy}` : null,
            partySize: val.partySize,
            maxPartySize: val.maxPartySize,
            partyOpen: val.partyAccessibility === 'OPEN',
            rank: val.competitiveTier ? await assets.rank(val.competitiveTier) : null,
            accountLevel: val.accountLevel,
            isIdle: val.isIdle
          },
          // Invite: you have VALORANT open with room in your party, they're in VALORANT menus and not with you.
          canInvite: selfCanInvite && val !== null && val.loopState === 'MENUS' && !inMyParty,
          // Join: their party is open, not full, in menus, and you have VALORANT open.
          canRequestJoin:
            self !== null &&
            val !== null &&
            !inMyParty &&
            val.loopState === 'MENUS' &&
            val.partyAccessibility === 'OPEN' &&
            val.partySize < val.maxPartySize
        }
      })
    )

    return views.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.gameName.localeCompare(b.gameName, undefined, { sensitivity: 'base' })
    )
  }

  async invite(friendPuuid: string): Promise<void> {
    const { api, session } = this.ctx
    const { puuid } = session.requireInfo()
    const { friends } = await api.call(Local.getFriends)
    const friend = friends.find((f) => f.puuid === friendPuuid)
    if (!friend) throw new AppError('INVALID_ACTION', 'That player is not on your friends list')
    const { CurrentPartyID } = await api.call(Party.getPartyPlayer, { puuid })
    await api.call(Party.inviteByName, { partyId: CurrentPartyID, gameName: friend.game_name, tagLine: friend.game_tag })
  }

  async requestJoin(friendPuuid: string): Promise<void> {
    const { api, session } = this.ctx
    const { puuid } = session.requireInfo()
    const { presences } = await api.call(Local.getPresences)
    const friend = findOwnPresence(presences, friendPuuid)
    if (!friend?.partyId) throw new AppError('INVALID_ACTION', "Can't find that player's party. Are they in VALORANT?")
    await api.call(Party.requestToJoin, { partyId: friend.partyId, puuid })
  }
}

function pickPresence(list: RawPresence[]): RawPresence | null {
  if (list.length === 0) return null
  const rank = (p: RawPresence) => {
    const i = PRODUCT_PRIORITY.indexOf(p.product)
    return i === -1 ? PRODUCT_PRIORITY.length : i
  }
  return [...list].sort((a, b) => rank(a) - rank(b))[0]
}

function toStatus(presence: RawPresence | null, val: ValorantPresence | null): FriendStatus {
  if (!presence) return 'offline'
  // VALORANT's own state is more precise than the generic chat state.
  if (val) return val.loopState !== 'MENUS' ? 'in-game' : val.isIdle ? 'away' : 'online'
  switch (presence.state) {
    case 'dnd':
      return 'in-game'
    case 'away':
      return 'away'
    case 'mobile':
      return 'mobile'
    case 'offline':
      return 'offline'
    default:
      return 'online'
  }
}
