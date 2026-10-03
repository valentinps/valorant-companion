import type { CSSProperties } from 'react'
import { api } from '../../api'
import { EmptyState, ErrorNote, Loading, PageHeader, RankBadge, timeAgo } from '../../components/ui'
import type { SavedPlayer } from '../../../../shared/types'
import { useOpenProfile } from '../overlays/Overlays'
import { useSavedPlayers } from './useSavedPlayers'

export function SavedPage() {
  const saved = useSavedPlayers()
  const list = saved.data

  return (
    <div className="page">
      <PageHeader
        title="Saved players"
        aside={list && list.length > 0 && <span className="muted">{list.length} saved</span>}
      />
      <ErrorNote message={saved.error} />
      {!list && saved.loading && <Loading />}
      {list?.length === 0 && (
        <EmptyState title="No saved players yet">
          Open anyone's profile, from a match, your party or your friends, and press Save player to keep track of
          their rank and stats here.
        </EmptyState>
      )}
      {list && list.length > 0 && (
        <>
          <ul className="saved-grid">
            {list.map((s) => (
              <SavedCard key={s.puuid} saved={s} />
            ))}
          </ul>
          <p className="muted saved-note">Stats update every time you open a player's profile on Competitive.</p>
        </>
      )}
    </div>
  )
}

function SavedCard({ saved: s }: { saved: SavedPlayer }) {
  const openProfile = useOpenProfile()
  const snap = s.snapshot
  const st = snap?.stats
  const name = s.player ? `${s.player.gameName}#${s.player.tagLine}` : undefined
  const banner: CSSProperties | undefined = snap?.cardImage ? { backgroundImage: `url(${snap.cardImage})` } : undefined

  return (
    <li className="saved-card">
      <button
        className="saved-open"
        onClick={() => openProfile({ puuid: s.puuid, name, hidden: s.hidden })}
        aria-label={`Open ${name ?? 'hidden player'}'s profile`}
      >
        <div className="saved-banner" style={banner}>
          <div className="saved-id">
            {s.player ? (
              <strong className="saved-name">
                {s.player.gameName}
                <span className="tag">#{s.player.tagLine}</span>
              </strong>
            ) : (
              <strong className="saved-name hidden-name">Hidden (streamer mode)</strong>
            )}
            {snap?.accountLevel != null && <span className="muted">Level {snap.accountLevel}</span>}
          </div>
          {snap?.mainAgent && (
            <img className="saved-agent" src={snap.mainAgent.icon} alt="" title={`Main: ${snap.mainAgent.name}`} />
          )}
        </div>

        <div className="saved-ranks">
          {snap?.rank ? <RankBadge rank={snap.rank} rr={snap.rankedRating} /> : <span className="muted">Unranked</span>}
          {snap?.peakRank && (
            <span className="saved-peak">
              <span className="muted">Peak</span>
              <RankBadge rank={snap.peakRank} />
            </span>
          )}
        </div>

        {st ? (
          <dl className="saved-stats">
            <MiniStat label="Win rate" value={`${st.winRate}%`} />
            <MiniStat label="K/D" value={st.kd.toFixed(2)} />
            <MiniStat label="ACS" value={String(st.acs)} />
            <MiniStat label="HS" value={st.headshotPct != null ? `${st.headshotPct}%` : '–'} />
          </dl>
        ) : (
          <p className="muted saved-empty">{snap ? 'No recent matches.' : 'Loading their stats…'}</p>
        )}

        <span className="saved-footer muted">
          {st && `Last ${st.matches} matches, `}
          {snap ? `updated ${timeAgo(snap.at)}` : `saved ${timeAgo(s.savedAt)}`}
        </span>
      </button>
      <button
        className="saved-remove"
        onClick={() => void api.invoke('saved.remove', s.puuid)}
        title="Remove from saved"
        aria-label={`Remove ${name ?? 'hidden player'} from saved`}
      >
        ×
      </button>
    </li>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
