import { useState } from 'react'
import { useCommand } from '../../api'
import { Modal, ModalHero } from '../../components/Modal'
import { ErrorNote, Loading, RankBadge } from '../../components/ui'
import type { PeakRank, PlayerProfileView, ProfileMatch } from '../../../../shared/types'
import { useOpenMatch } from '../overlays/Overlays'

const QUEUES: { id: string | null; label: string }[] = [
  { id: null, label: 'All modes' },
  { id: 'competitive', label: 'Competitive' },
  { id: 'unrated', label: 'Unrated' },
  { id: 'swiftplay', label: 'Swiftplay' }
]

const MATCH_COUNT = 10

interface Props {
  puuid: string
  name?: string
  onClose: () => void
  /** True while the match view is open on top: Escape then closes that instead. */
  inert?: boolean
}

export function PlayerProfileModal({ puuid, name, onClose, inert = false }: Props) {
  const [queue, setQueue] = useState<string | null>(null)
  const profile = useCommand('players.profile', [puuid, queue, MATCH_COUNT])
  const p = profile.data?.puuid === puuid ? profile.data : undefined

  const rank =
    p &&
    (p.rankUnavailable ? (
      <span className="muted rank-note">Rank unavailable right now</span>
    ) : (
      <RankBadge rank={p.rank} rr={p.rankedRating} size="lg" />
    ))

  return (
    <Modal label="Player profile" onClose={onClose} inert={inert}>
      <ModalHero image={p?.cardImage ?? null} aside={rank}>
        <h2>
          {p ? p.player.gameName : (name?.split('#')[0] ?? 'Player')}
          <span className="tag">#{p ? p.player.tagLine : (name?.split('#')[1] ?? '')}</span>
        </h2>
        {p?.accountLevel != null && <p>Level {p.accountLevel}</p>}
      </ModalHero>

      <div className="modal-toolbar">
        <div className="segmented" role="tablist" aria-label="Game mode">
          {QUEUES.map((q) => (
            <button key={q.label} role="tab" aria-selected={queue === q.id} onClick={() => setQueue(q.id)}>
              {q.label}
            </button>
          ))}
        </div>
        {p && (
          <a className="tracker-link" href={p.trackerUrl} target="_blank" rel="noreferrer">
            Open on tracker.gg
          </a>
        )}
      </div>

      <div className="modal-body">
        <ErrorNote message={profile.error} />
        {profile.loading && !p && <Loading />}
        {p && <ProfileBody profile={p} refreshing={profile.loading} />}
      </div>
    </Modal>
  )
}

function ProfileBody({ profile: p, refreshing }: { profile: PlayerProfileView; refreshing: boolean }) {
  const s = p.stats
  return (
    <div className={`profile-layout ${refreshing ? 'is-refreshing' : ''}`}>
      <div className="profile-summary">
        <h3 className="section-title">{s ? `Last ${s.matches} matches` : 'Stats'}</h3>
        {!s && <p className="muted">No matches in this mode recently.</p>}
        {(s || p.peakRank || p.rankUnavailable) && (
          <dl className="stat-grid">
            {s && (
              <>
                <Stat label="Win rate" value={`${s.winRate}%`} detail={`${s.wins}W ${s.matches - s.wins}L`} />
                <Stat label="K/D" value={s.kd.toFixed(2)} detail={`${s.kda.kills} / ${s.kda.deaths} / ${s.kda.assists}`} />
                <Stat label="ACS" value={String(s.acs)} detail="avg combat score" />
                <Stat label="ADR" value={s.adr != null ? String(s.adr) : '–'} detail="avg damage / round" />
                <Stat label="Headshots" value={s.headshotPct != null ? `${s.headshotPct}%` : '–'} detail="of hits" />
              </>
            )}
            {p.peakRank ? (
              <PeakStat peak={p.peakRank} fullWidth={!s} />
            ) : p.rankUnavailable ? (
              <div className={`stat stat-peak ${s ? "" : "full"}`}>
                <dt>Peak rank</dt>
                <dd className="muted peak-note">
                  Unavailable right now, reopen the profile to retry
                </dd>
              </div>
            ) : null}
          </dl>
        )}

        {p.topAgents.length > 0 && (
          <>
            <h3 className="section-title">Most played</h3>
            <div className="top-agents">
              {p.topAgents.map((a) => (
                <div key={a.agent.id} className="top-agent">
                  <img src={a.agent.icon} alt="" />
                  <div>
                    <strong>{a.agent.name}</strong>
                    <span className="muted">
                      {a.games} {a.games === 1 ? 'game' : 'games'}, {Math.round((a.wins / a.games) * 100)}% wins, {a.kd} K/D
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="profile-history">
        <h3 className="section-title">Matches</h3>
        {p.matches.length > 0 ? (
          <ol className="profile-matches">
            {p.matches.map((m) => (
              <ProfileMatchRow key={m.matchId} match={m} perspectivePuuid={p.puuid} />
            ))}
          </ol>
        ) : (
          <p className="muted">Nothing to show for this mode.</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <span className="stat-value">{value}</span>
        <span className="muted">{detail}</span>
      </dd>
    </div>
  )
}

/** All-time peak rank, filling the rest of the stat grid's last row. */
function PeakStat({ peak, fullWidth }: { peak: PeakRank; fullWidth: boolean }) {
  const day = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const month = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  const when = peak.reachedAt
    ? `Reached ${day(peak.reachedAt)}`
    : peak.actStart && peak.actEnd
      ? `${month(peak.actStart)} to ${month(peak.actEnd)}`
      : null
  return (
    <div className={`stat stat-peak ${fullWidth ? 'full' : ''}`} style={{ '--rank-color': peak.rank.color ?? 'var(--text)' } as React.CSSProperties}>
      <dt>Peak rank</dt>
      <dd>
        {peak.rank.icon && <img src={peak.rank.icon} alt="" />}
        <span className="peak-text">
          <span className="stat-value peak-name">{peak.rank.name}</span>
          <span className="muted">
            {peak.act}
            {when && `, ${when}`}
            {peak.timesReached > 1 && ` (reached in ${peak.timesReached} acts)`}
          </span>
        </span>
      </dd>
    </div>
  )
}

const OUTCOME_LABEL = { win: 'Win', loss: 'Loss', draw: 'Draw' }

function ProfileMatchRow({ match: m, perspectivePuuid }: { match: ProfileMatch; perspectivePuuid: string }) {
  const openMatch = useOpenMatch()
  return (
    <li>
      <button
        className={`profile-match outcome-${m.outcome}`}
        onClick={() => openMatch({ matchId: m.matchId, perspectivePuuid })}
        aria-label={`Open match on ${m.map.name}`}
      >
        {m.agent ? <img src={m.agent.icon} alt={m.agent.name} title={m.agent.name} /> : <span className="agent-placeholder" />}
        <div className="pm-main">
          <span>
            <strong>{m.map.name}</strong> <span className="muted">{m.queue}</span>
          </span>
          <span className="muted">
            {new Date(m.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="pm-result">
          <strong>{m.score ?? OUTCOME_LABEL[m.outcome]}</strong>
          <span className="muted">{OUTCOME_LABEL[m.outcome]}</span>
        </div>
        <div className="pm-kda">
          <strong>
            {m.kills}/{m.deaths}/{m.assists}
          </strong>
          <span className="muted">
            {m.acs} ACS{m.headshotPct != null && `, ${m.headshotPct}% HS`}
          </span>
        </div>
        <span className={`rr-change ${m.rrChange == null ? '' : m.rrChange > 0 ? 'gain' : m.rrChange < 0 ? 'loss' : ''}`}>
          {m.rrChange == null ? '' : `${m.rrChange > 0 ? '+' : ''}${m.rrChange}`}
        </span>
      </button>
    </li>
  )
}
