import { useState } from 'react'
import { useCommand } from '../../api'
import { Modal, ModalHero } from '../../components/Modal'
import { ErrorNote, Loading, RankBadge } from '../../components/ui'
import { BookmarkIcon } from '../../components/icons'
import { useSavedToggle } from '../saved/useSavedPlayers'
import { DEFAULT_QUEUE, ProfileBody, QueueTabs } from './ProfileParts'

const MATCH_COUNT = 10

interface Props {
  puuid: string
  name?: string
  hidden?: boolean
  onClose: () => void
  onBack?: () => void
  /** True while the match view is open on top: Escape then closes that instead. */
  inert?: boolean
}

export function PlayerProfileModal({ puuid, name, hidden = false, onClose, onBack, inert = false }: Props) {
  const [queue, setQueue] = useState<string | null>(DEFAULT_QUEUE)
  const profile = useCommand('players.profile', [puuid, queue, MATCH_COUNT, hidden])
  const p = profile.data?.puuid === puuid ? profile.data : undefined

  const rank =
    p &&
    (p.rankUnavailable ? (
      <span className="muted rank-note">Rank unavailable right now</span>
    ) : (
      <RankBadge rank={p.rank} rr={p.rankedRating} size="lg" />
    ))

  return (
    <Modal label="Player profile" onClose={onClose} onBack={onBack} inert={inert}>
      <ModalHero image={p?.cardImage ?? null} aside={rank}>
        {hidden || (p && !p.player) ? (
          <h2 className="hidden-name">Hidden (streamer mode)</h2>
        ) : (
          <h2>
            {p?.player ? p.player.gameName : (name?.split('#')[0] ?? 'Player')}
            <span className="tag">#{p?.player ? p.player.tagLine : (name?.split('#')[1] ?? '')}</span>
          </h2>
        )}
        {p?.accountLevel != null && <p>Level {p.accountLevel}</p>}
      </ModalHero>

      <div className="modal-toolbar">
        <QueueTabs queue={queue} onChange={setQueue} />
        <div className="toolbar-actions">
          {p?.trackerUrl && (
            <a className="tracker-link" href={p.trackerUrl} target="_blank" rel="noreferrer">
              Open on tracker.gg
            </a>
          )}
          {p && !p.isSelf && <SaveButton puuid={puuid} hidden={hidden || !p.player} />}
        </div>
      </div>

      <div className="modal-body">
        <ErrorNote message={profile.error} />
        {profile.loading && !p && <Loading />}
        {p && <ProfileBody profile={p} refreshing={profile.loading} />}
      </div>
    </Modal>
  )
}

function SaveButton({ puuid, hidden }: { puuid: string; hidden: boolean }) {
  const { isSaved, ready, pending, error, toggle } = useSavedToggle(puuid, hidden)
  return (
    <button
      className={`save-button ${isSaved ? 'is-saved' : ''}`}
      onClick={() => void toggle()}
      disabled={!ready || pending}
      aria-pressed={isSaved}
      title={error ?? (isSaved ? 'Remove from saved players' : 'Keep track of this player in Saved')}
    >
      <BookmarkIcon filled={isSaved} />
      {isSaved ? 'Saved' : 'Save player'}
    </button>
  )
}
