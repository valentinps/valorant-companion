import { useMemo, useState } from 'react'
import { useAction, useCommand, useStatus } from '../../api'
import { EmptyState, ErrorNote, Loading, PageHeader, RankBadge } from '../../components/ui'
import type { FriendView } from '../../../../shared/types'
import { PlayerLink } from '../profile/PlayerLink'

const PRODUCT_NAMES: Record<string, string> = {
  league_of_legends: 'League of Legends',
  bacon: 'Legends of Runeterra',
  lion: '2XKO',
  riot_client: 'Riot Client'
}

export function FriendsPage() {
  const status = useStatus()
  const friends = useCommand('friends.list', [], { refreshOn: ['friends'], intervalMs: 30_000 })
  const [query, setQuery] = useState('')
  const [showOffline, setShowOffline] = useState(false)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (friends.data ?? []).filter(
      (f) => !q || `${f.gameName}#${f.tagLine} ${f.note}`.toLowerCase().includes(q)
    )
    return {
      valorant: list.filter((f) => f.valorant && f.status !== 'offline'),
      online: list.filter((f) => !f.valorant && f.status !== 'offline'),
      offline: list.filter((f) => f.status === 'offline')
    }
  }, [friends.data, query])

  const gameOpen = status.phase !== 'GAME_CLOSED'

  return (
    <div className="page">
      <PageHeader
        title="Friends"
        aside={
          <input
            className="search"
            type="search"
            placeholder="Search friends"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search friends"
          />
        }
      />
      {!gameOpen && <p className="muted notice">Open VALORANT to invite friends or ask to join their party.</p>}
      <ErrorNote message={friends.error} />
      {!friends.data && friends.loading && <Loading />}

      {friends.data && friends.data.length === 0 && (
        <EmptyState title="No friends yet">Friends you add in the Riot Client show up here.</EmptyState>
      )}

      <FriendGroup title="Playing VALORANT" friends={groups.valorant} />
      <FriendGroup title="Online" friends={groups.online} />

      {groups.offline.length > 0 && (
        <>
          <h3 className="section-title">
            <button className="disclosure" aria-expanded={showOffline} onClick={() => setShowOffline(!showOffline)}>
              Offline ({groups.offline.length})
            </button>
          </h3>
          {showOffline && <FriendList friends={groups.offline} />}
        </>
      )}
    </div>
  )
}

function FriendGroup({ title, friends }: { title: string; friends: FriendView[] }) {
  if (friends.length === 0) return null
  return (
    <>
      <h3 className="section-title">
        {title} <span className="muted">{friends.length}</span>
      </h3>
      <FriendList friends={friends} />
    </>
  )
}

function FriendList({ friends }: { friends: FriendView[] }) {
  return (
    <ul className="friend-list">
      {friends.map((f) => (
        <FriendRow key={f.puuid} friend={f} />
      ))}
    </ul>
  )
}

function FriendRow({ friend: f }: { friend: FriendView }) {
  const [sent, setSent] = useState<'invite' | 'join' | null>(null)
  const invite = useAction('friends.invite')
  const join = useAction('friends.requestJoin')

  return (
    <li className={`friend status-${f.status}`}>
      <span className="status-dot" aria-hidden />
      <div className="friend-info">
        <PlayerLink puuid={f.puuid} displayName={`${f.gameName}#${f.tagLine}`} isSelf={false} />
        <span className="muted">{activityText(f)}</span>
        {f.note && <span className="friend-note">{f.note}</span>}
      </div>
      {f.valorant?.rank && <RankBadge rank={f.valorant.rank} />}
      <div className="friend-actions">
        {sent === 'invite' && <span className="sent">Invite sent</span>}
        {sent === 'join' && <span className="sent">Request sent</span>}
        {!sent && f.canRequestJoin && (
          <button
            className="small"
            disabled={join.pending}
            onClick={async () => (await join.run(f.puuid)) && setSent('join')}
          >
            Ask to join
          </button>
        )}
        {!sent && f.canInvite && (
          <button
            className="small"
            disabled={invite.pending}
            onClick={async () => (await invite.run(f.puuid)) && setSent('invite')}
          >
            Invite
          </button>
        )}
        <ErrorNote message={invite.error ?? join.error} />
      </div>
    </li>
  )
}

function activityText(f: FriendView): string {
  const v = f.valorant
  if (f.status === 'offline') {
    return f.lastOnline ? `Last online ${relativeTime(f.lastOnline)}` : 'Offline'
  }
  if (v) {
    if (v.loopState === 'INGAME') {
      return [v.queue, v.map && `on ${v.map}`, v.score].filter(Boolean).join(' ') + partyText(f)
    }
    if (v.loopState === 'PREGAME') return `Agent select, ${v.queue}${v.map ? ` on ${v.map}` : ''}${partyText(f)}`
    return `${v.isIdle ? 'Away' : 'In menus'}${v.queue ? `, ${v.queue}` : ''}${partyText(f)}`
  }
  if (f.status === 'mobile') return 'On mobile'
  if (f.product) return `In ${PRODUCT_NAMES[f.product] ?? f.product}`
  return 'Online'
}

function partyText(f: FriendView): string {
  const v = f.valorant
  if (!v || v.partySize <= 1) return v?.partyOpen ? ', party open' : ''
  return `, party ${v.partySize}/${v.maxPartySize}${v.partyOpen ? ' (open)' : ''}`
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86_400_000],
    ['month', 30 * 86_400_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ]
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (diff >= ms) return fmt.format(-Math.floor(diff / ms), unit)
  }
  return 'just now'
}
