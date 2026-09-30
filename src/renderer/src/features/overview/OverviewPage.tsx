import { useCommand } from '../../api'
import { useOpenMatch, useOpenProfile } from '../overlays/Overlays'
import { EmptyState, ErrorNote, Loading, PageHeader, RankBadge, formatDuration } from '../../components/ui'
import type { MatchSummary } from '../../../../shared/types'

export function OverviewPage() {
  const profile = useCommand('profile.get', [], { intervalMs: 120_000 })
  const matches = useCommand('matches.recent', [10], { intervalMs: 120_000 })
  const p = profile.data
  const openProfile = useOpenProfile()
  const openMatch = useOpenMatch()

  return (
    <div className="page">
      <PageHeader title="Overview" />

      {p ? (
        <section className="profile">
          <div className="profile-id">
            <h2 className="profile-name">
              {p.player.gameName}
              <span className="tag">#{p.player.tagLine}</span>
            </h2>
            <p className="muted">
              Level {p.accountLevel} on the {p.region.toUpperCase()} server
            </p>
            <button
              className="secondary"
              onClick={() => openProfile({ puuid: p.player.puuid, name: `${p.player.gameName}#${p.player.tagLine}` })}
            >
              View my stats
            </button>
          </div>
          <RankBadge rank={p.rank} rr={p.rankedRating} size="lg" />
        </section>
      ) : profile.loading ? (
        <Loading />
      ) : null}
      <ErrorNote message={profile.error} />

      <h3 className="section-title">Recent matches</h3>
      <ErrorNote message={matches.error} />
      {matches.data?.length === 0 && <EmptyState title="No matches yet">Play a game and it will show up here.</EmptyState>}
      {matches.data && matches.data.length > 0 && (
        <ol className="match-list">
          {matches.data.map((m) => (
            <MatchRow
              key={m.matchId}
              match={m}
              onOpen={p ? () => openMatch({ matchId: m.matchId, perspectivePuuid: p.player.puuid }) : undefined}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function MatchRow({ match, onOpen }: { match: MatchSummary; onOpen?: () => void }) {
  const rr = match.rrChange
  const tone = rr == null ? '' : rr > 0 ? 'gain' : rr < 0 ? 'loss' : ''
  return (
    <li className="match-row" onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()} tabIndex={onOpen ? 0 : undefined} role={onOpen ? 'button' : undefined} aria-label={onOpen ? `Open match on ${match.map.name}` : undefined}>
      <div className="match-map" style={match.map.icon ? { backgroundImage: `url(${match.map.icon})` } : undefined}>
        <span>{match.map.name}</span>
      </div>
      <div className="match-meta">
        <span>{match.queue}</span>
        <span className="muted">
          {new Date(match.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          {match.durationMs > 0 && `, ${formatDuration(match.durationMs)}`}
        </span>
      </div>
      <RankBadge rank={match.rankAfter} rr={match.rrAfter} />
      <span className={`rr-change ${tone}`}>{rr == null ? '' : `${rr > 0 ? '+' : ''}${rr}`}</span>
    </li>
  )
}
