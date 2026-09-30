import { useAction, useCommand, useStatus } from '../../api'
import { EmptyState, ErrorNote, PageHeader, RankBadge } from '../../components/ui'
import { PlayerLink } from '../profile/PlayerLink'

export function PartyPage() {
  const status = useStatus()
  const gameOpen = status.phase === 'MENUS' || status.phase === 'PREGAME' || status.phase === 'INGAME'
  const party = useCommand('party.get', [], { enabled: gameOpen, refreshOn: ['party'], intervalMs: 10_000 })

  const setReady = useAction('party.setReady', party.reload)
  const changeQueue = useAction('party.changeQueue', party.reload)
  const startQueue = useAction('party.startQueue', party.reload)
  const stopQueue = useAction('party.stopQueue', party.reload)
  const setOpen = useAction('party.setOpen', party.reload)
  const actionError = setReady.error ?? changeQueue.error ?? startQueue.error ?? stopQueue.error ?? setOpen.error

  const p = party.data
  if (!gameOpen || !p) {
    return (
      <div className="page">
        <PageHeader title="Party" />
        <EmptyState title="VALORANT isn't open">Start the game to see your party and control the queue from here.</EmptyState>
        <ErrorNote message={gameOpen ? party.error : null} />
      </div>
    )
  }

  const self = p.members.find((m) => m.isSelf)
  const inMenus = status.phase === 'MENUS'

  return (
    <div className="page">
      <PageHeader
        title="Party"
        aside={
          <label className="switch">
            <input
              type="checkbox"
              checked={p.accessibility === 'OPEN'}
              disabled={!p.isSelfOwner || setOpen.pending}
              onChange={(e) => void setOpen.run(e.target.checked)}
            />
            <span>Open to join requests</span>
          </label>
        }
      />

      <section className="queue-panel">
        <div className="queue-select">
          <label htmlFor="queue">Mode</label>
          <select
            id="queue"
            value={p.queueId}
            disabled={!p.isSelfOwner || p.isMatchmaking || changeQueue.pending}
            onChange={(e) => void changeQueue.run(e.target.value)}
          >
            {p.eligibleQueues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        {p.isMatchmaking ? (
          <button className="queue-button is-searching" disabled={stopQueue.pending} onClick={() => void stopQueue.run()}>
            Searching… click to cancel
          </button>
        ) : (
          <button
            className="queue-button"
            disabled={!p.isSelfOwner || !inMenus || startQueue.pending}
            title={!p.isSelfOwner ? 'Only the party leader can start the queue' : undefined}
            onClick={() => void startQueue.run()}
          >
            Start queue
          </button>
        )}
      </section>
      <ErrorNote message={actionError} />

      <h3 className="section-title">Members ({p.members.length})</h3>
      <div className="party-members">
        {p.members.map((m) => (
          <div key={m.puuid} className={`team-row ${m.isSelf ? 'is-self' : ''}`}>
            <div className={`ready-dot ${m.isReady ? 'ready' : ''}`} title={m.isReady ? 'Ready' : 'Not ready'} />
            <div className="team-info">
              <PlayerLink puuid={m.puuid} displayName={m.displayName} isSelf={m.isSelf} />
              <span className="muted">
                {m.isOwner ? 'Leader' : 'Member'}
                {m.accountLevel != null && `, level ${m.accountLevel}`}
                {m.ping != null && `, ${m.ping} ms`}
              </span>
            </div>
            <RankBadge rank={m.rank} />
          </div>
        ))}
      </div>

      {self && !self.isOwner && (
        <button className="secondary" disabled={setReady.pending} onClick={() => void setReady.run(!self.isReady)}>
          {self.isReady ? 'Mark not ready' : 'Mark ready'}
        </button>
      )}
    </div>
  )
}
