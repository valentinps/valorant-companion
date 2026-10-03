import { useState, type CSSProperties } from 'react'
import { useCommand, useStatus } from '../../api'
import { useOpenProfile } from '../overlays/Overlays'
import { ErrorNote, Loading, RankBadge } from '../../components/ui'
import type { ProfileView } from '../../../../shared/types'
import { DEFAULT_QUEUE, ProfileBody, QueueTabs } from '../profile/ProfileParts'

/** The most matches Riot's history returns per request, so the widest window the stats can cover. */
const MATCH_COUNT = 20

export function OverviewPage() {
  const puuid = useStatus().player?.puuid
  const profile = useCommand('profile.get', [], { intervalMs: 120_000 })
  const [queue, setQueue] = useState<string | null>(DEFAULT_QUEUE)
  const stats = useCommand('players.profile', [puuid ?? '', queue, MATCH_COUNT], {
    intervalMs: 120_000,
    enabled: puuid !== undefined
  })
  const p = profile.data
  const s = stats.data?.puuid === puuid ? stats.data : undefined

  return (
    <div className="page page-wide">
      {p ? <OverviewHero profile={p} /> : profile.loading ? <div className="overview-hero is-loading" /> : null}
      <ErrorNote message={profile.error} />

      <div className="overview-toolbar">
        <h3 className="section-title">Your form</h3>
        <QueueTabs queue={queue} onChange={setQueue} />
      </div>
      <ErrorNote message={stats.error} />
      {stats.loading && !s && <Loading />}
      {s && <ProfileBody profile={s} refreshing={stats.loading} />}
    </div>
  )
}

/** Your equipped banner, title, level and current rank. */
function OverviewHero({ profile: p }: { profile: ProfileView }) {
  const openProfile = useOpenProfile()
  const banner: CSSProperties | undefined = p.card ? { backgroundImage: `url(${p.card.wide})` } : undefined
  return (
    <section className="overview-hero" style={banner}>
      {p.card && <img className="overview-card" src={p.card.large} alt="Equipped player card" />}
      <div className="overview-id">
        {p.title && <span className="overview-title">{p.title}</span>}
        <h1 className="overview-name">
          {p.player.gameName}
          <span className="tag">#{p.player.tagLine}</span>
        </h1>
        <p className="muted">
          Level {p.accountLevel}, {p.region.toUpperCase()} server
        </p>
        <button
          className="secondary"
          onClick={() => openProfile({ puuid: p.player.puuid, name: `${p.player.gameName}#${p.player.tagLine}` })}
        >
          Open full profile
        </button>
      </div>
      <div className="overview-rank">
        <RankBadge rank={p.rank} rr={p.rankedRating} size="lg" />
      </div>
    </section>
  )
}
