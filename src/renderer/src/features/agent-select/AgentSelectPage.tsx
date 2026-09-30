import { useMemo, useState } from 'react'
import { useAction, useCommand, useStatus } from '../../api'
import { Countdown, EmptyState, ErrorNote, RankBadge } from '../../components/ui'
import { PlayerLink } from '../profile/PlayerLink'
import type { AgentOption, PregameView, TeamSlot } from '../../../../shared/types'

export function AgentSelectPage() {
  const status = useStatus()
  const inPregame = status.phase === 'PREGAME'
  const pregame = useCommand('pregame.get', [], { enabled: inPregame, refreshOn: ['pregame'], intervalMs: 2000 })

  if (!inPregame || !pregame.data) {
    return (
      <div className="page">
        <EmptyState title="Not in agent select">
          This page opens by itself when a match is found. You'll see your team and can pick your agent from here.
        </EmptyState>
        <ErrorNote message={inPregame ? pregame.error : null} />
      </div>
    )
  }
  return <AgentSelect view={pregame.data} reload={pregame.reload} />
}

function AgentSelect({ view, reload }: { view: PregameView; reload: () => void }) {
  const [role, setRole] = useState<string | null>(null)
  const select = useAction('pregame.select', reload)
  const lock = useAction('pregame.lock', reload)

  const self = view.self
  const locked = self?.selectionState === 'locked'
  const hovered = self?.agent ?? null
  const roles = useMemo(() => [...new Set(view.agents.map((a) => a.role).filter(Boolean))] as string[], [view.agents])
  const agents = role ? view.agents.filter((a) => a.role === role) : view.agents

  return (
    <div className="agent-select">
      <header className="pregame-banner" style={view.map.splash ? { backgroundImage: `url(${view.map.splash})` } : undefined}>
        <div className="pregame-banner-text">
          <h1>{view.map.name}</h1>
          <p>{view.queue}</p>
        </div>
        <div className="pregame-timer" aria-label="Seconds left in agent select">
          <Countdown endsAt={view.endsAt} />
        </div>
      </header>

      <div className="pregame-body">
        <section className="team" aria-label="Your team">
          {view.team.map((slot) => (
            <TeamRow key={slot.puuid} slot={slot} />
          ))}
        </section>

        <section className="agent-picker" aria-label="Agents">
          <div className="role-filter" role="tablist">
            <button role="tab" aria-selected={role === null} onClick={() => setRole(null)}>
              All
            </button>
            {roles.map((r) => (
              <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="agent-grid">
            {agents.map((agent) => (
              <AgentTile
                key={agent.id}
                agent={agent}
                isHovered={hovered?.id === agent.id}
                disabled={locked || select.pending || lock.pending}
                onPick={() => void select.run(agent.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <footer className={`lock-bar ${locked ? 'is-locked' : ''}`}>
        <div className="lock-choice">
          {hovered ? (
            <>
              <img src={hovered.icon} alt="" />
              <span>{hovered.name}</span>
            </>
          ) : (
            <span className="muted">Pick an agent</span>
          )}
        </div>
        <ErrorNote message={select.error ?? lock.error} />
        <button
          className="lock-button"
          disabled={!hovered || locked || lock.pending}
          onClick={() => hovered && void lock.run(hovered.id)}
        >
          {locked ? 'Locked in' : lock.pending ? 'Locking…' : 'Lock in'}
        </button>
      </footer>
    </div>
  )
}

function TeamRow({ slot }: { slot: TeamSlot }) {
  return (
    <div className={`team-row state-${slot.selectionState || 'none'} ${slot.isSelf ? 'is-self' : ''}`}>
      <div className="team-agent">{slot.agent ? <img src={slot.agent.icon} alt="" /> : <span className="agent-placeholder" />}</div>
      <div className="team-info">
        <PlayerLink puuid={slot.puuid} displayName={slot.displayName} isSelf={slot.isSelf} />
        <span className="muted">
          {slot.agent ? slot.agent.name : 'Choosing'}
          {slot.selectionState === 'locked' ? ', locked' : slot.agent ? ', hovering' : ''}
        </span>
      </div>
      <RankBadge rank={slot.rank} />
    </div>
  )
}

function AgentTile(props: { agent: AgentOption; isHovered: boolean; disabled: boolean; onPick: () => void }) {
  const { agent, isHovered, disabled, onPick } = props
  const unavailable = !agent.owned || agent.takenBy !== null
  const reason = !agent.owned ? 'Not unlocked' : agent.takenBy ? `Locked by ${agent.takenBy}` : undefined
  return (
    <button
      className={`agent-tile ${isHovered ? 'is-hovered' : ''}`}
      disabled={disabled || unavailable}
      onClick={onPick}
      title={reason ?? agent.name}
      aria-pressed={isHovered}
    >
      <img src={agent.icon} alt="" loading="lazy" />
      <span>{agent.name}</span>
    </button>
  )
}
