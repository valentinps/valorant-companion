import { useState } from 'react'
import { useCommand } from '../../api'
import { Modal, ModalHero } from '../../components/Modal'
import { ErrorNote, Loading, formatDuration } from '../../components/ui'
import type {
  KillEvent,
  MatchDetailView,
  MatchPlayerLine,
  MatchTeamLine,
  RoundLine
} from '../../../../shared/types'
import { useOpenProfile, type MatchTarget } from '../overlays/Overlays'

type Tab = 'scoreboard' | 'rounds'

export function MatchView({ matchId, perspectivePuuid, onClose }: MatchTarget & { onClose: () => void }) {
  const match = useCommand('matches.details', [matchId, perspectivePuuid])
  const [tab, setTab] = useState<Tab>('scoreboard')
  const m = match.data
  const hasRounds = (m?.rounds.length ?? 0) > 0

  return (
    <Modal label="Match details" onClose={onClose}>
      {!m && match.loading && (
        <div className="modal-loading">
          <Loading />
        </div>
      )}
      <ErrorNote message={match.error} />
      {m && (
        <>
          <MatchHeader match={m} />
          {hasRounds && (
            <div className="modal-toolbar">
              <div className="segmented" role="tablist">
                <button role="tab" aria-selected={tab === 'scoreboard'} onClick={() => setTab('scoreboard')}>
                  Scoreboard
                </button>
                <button role="tab" aria-selected={tab === 'rounds'} onClick={() => setTab('rounds')}>
                  Rounds
                </button>
              </div>
            </div>
          )}
          <div className="modal-body">
            {tab === 'scoreboard' || !hasRounds ? <Scoreboard match={m} /> : <Rounds match={m} />}
          </div>
        </>
      )}
    </Modal>
  )
}

const OUTCOME_TEXT = { win: 'Victory', loss: 'Defeat', draw: 'Draw' }

function MatchHeader({ match: m }: { match: MatchDetailView }) {
  const [ally, enemy] = m.teams
  const result = m.outcome && (
    <div className={`match-result outcome-${m.outcome}`}>
      <span className="match-result-label">{OUTCOME_TEXT[m.outcome]}</span>
      {ally && enemy && (
        <span className="match-score">
          {ally.roundsWon}
          <span className="muted">–</span>
          {enemy.roundsWon}
        </span>
      )}
    </div>
  )
  return (
    <ModalHero image={m.map.splash} aside={result}>
      <h2>{m.map.name}</h2>
      <p>
        {m.queue}, {new Date(m.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        {m.durationMs > 0 && `, ${formatDuration(m.durationMs)}`}
        {m.completion !== 'Completed' && `, ended by ${m.completion.toLowerCase()}`}
      </p>
    </ModalHero>
  )
}

// ---------- Scoreboard ----------

function Scoreboard({ match }: { match: MatchDetailView }) {
  const twoTeams = match.teams.length === 2
  return (
    <div className="scoreboards">
      {match.teams.map((team) => (
        <TeamTable key={team.teamId} team={team} label={teamLabel(team, twoTeams)} />
      ))}
      <p className="muted legend">
        ACS average combat score, ADR average damage per round, HS headshot rate, FK/FD first kills/deaths,
        MK rounds with 3+ kills. Matching dots mark players who queued together.
      </p>
    </div>
  )
}

function teamLabel(team: MatchTeamLine, twoTeams: boolean): string {
  if (!twoTeams) return 'Players'
  return `${team.isPerspective ? 'Your team' : 'Enemy team'}, ${team.won ? 'won' : 'lost'}`
}

function TeamTable({ team, label }: { team: MatchTeamLine; label: string }) {
  const openProfile = useOpenProfile()
  return (
    <section className={`team-table ${team.isPerspective ? 'ally' : 'enemy'}`}>
      <h3 className="section-title">{label}</h3>
      <table>
        <thead>
          <tr>
            <th className="col-player">Player</th>
            <th>ACS</th>
            <th>K</th>
            <th>D</th>
            <th>A</th>
            <th>+/–</th>
            <th>ADR</th>
            <th>HS</th>
            <th>FK</th>
            <th>FD</th>
            <th>MK</th>
          </tr>
        </thead>
        <tbody>
          {team.players.map((p) => (
            <tr key={p.puuid} className={p.isPerspective ? 'is-self' : undefined}>
              <td className="col-player">
                <div className="sb-player">
                  {p.agent ? <img src={p.agent.icon} alt={p.agent.name} title={p.agent.name} /> : <span className="agent-placeholder" />}
                  {p.rank && p.rank.icon && <img className="sb-rank" src={p.rank.icon} alt={p.rank.name} title={p.rank.name} />}
                  <button className="player-link sb-name" onClick={() => openProfile({ puuid: p.puuid, name: p.displayName })}>
                    {p.displayName.split('#')[0]}
                    <span className="tag">#{p.displayName.split('#')[1]}</span>
                  </button>
                  {p.partyGroup !== null && (
                    <span className={`party-dot party-${p.partyGroup % 6}`} title="Queued together" aria-label="Queued together" />
                  )}
                  <Badges player={p} />
                </div>
              </td>
              <td className="num strong">{p.acs}</td>
              <td className="num">{p.kills}</td>
              <td className="num">{p.deaths}</td>
              <td className="num">{p.assists}</td>
              <td className={`num ${p.plusMinus > 0 ? 'gain' : p.plusMinus < 0 ? 'loss' : ''}`}>
                {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
              </td>
              <td className="num">{p.adr ?? '–'}</td>
              <td className="num">{p.headshotPct != null ? `${Math.round(p.headshotPct)}%` : '–'}</td>
              <td className="num">{p.firstKills}</td>
              <td className="num">{p.firstDeaths}</td>
              <td className="num">{p.multiKills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Badges({ player }: { player: MatchPlayerLine }) {
  if (player.isMatchMvp) return <span className="badge mvp">Match MVP</span>
  if (player.isTeamMvp) return <span className="badge">Team MVP</span>
  return null
}

// ---------- Rounds ----------

function Rounds({ match }: { match: MatchDetailView }) {
  const [selected, setSelected] = useState(0)
  const allyTeam = match.teams.find((t) => t.isPerspective)?.teamId
  const round = match.rounds[selected]
  const swapIndex = match.rounds.findIndex(
    (r) => r.attackingTeamId && r.attackingTeamId !== match.rounds[0].attackingTeamId
  )

  return (
    <div className="rounds">
      <ol className="round-strip" aria-label="Rounds">
        {match.rounds.map((r, i) => {
          const won = r.winningTeamId === allyTeam
          return (
            <li key={r.number} className={i === swapIndex ? 'after-swap' : undefined}>
              <button
                className={`round-cell ${won ? 'won' : 'lost'} ${i === selected ? 'is-selected' : ''}`}
                onClick={() => setSelected(i)}
                aria-label={`Round ${r.number}, ${won ? 'won' : 'lost'} by ${r.result.toLowerCase()}`}
                aria-pressed={i === selected}
              >
                <span className="round-num">{r.number}</span>
                <ResultGlyph result={r.result} />
                {r.ceremony && <span className="ceremony-dot" title={r.ceremony} />}
              </button>
            </li>
          )
        })}
      </ol>
      {round && <RoundDetail round={round} allyTeam={allyTeam} />}
    </div>
  )
}

/** Tiny glyph for how the round ended. */
function ResultGlyph({ result }: { result: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }
  if (result === 'Spike detonated')
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="2.5" />
        <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.8 2.8l1.4 1.4M9.8 9.8l1.4 1.4M2.8 11.2l1.4-1.4M9.8 4.2l1.4-1.4" />
      </svg>
    )
  if (result === 'Spike defused')
    return (
      <svg {...common}>
        <path d="M7 1.5 12 4v3.5c0 2.6-2.1 4.4-5 5-2.9-.6-5-2.4-5-5V4z" />
      </svg>
    )
  if (result === 'Time ran out')
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.5" />
        <path d="M7 4v3.2l2 1.3" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="m3 3 8 8M11 3l-8 8" />
    </svg>
  )
}

function RoundDetail({ round, allyTeam }: { round: RoundLine; allyTeam: string | undefined }) {
  const won = round.winningTeamId === allyTeam
  const side = round.attackingTeamId ? (round.attackingTeamId === allyTeam ? 'attack' : 'defense') : null
  const ally = round.economy.find((e) => e.teamId === allyTeam)
  const enemy = round.economy.find((e) => e.teamId !== allyTeam)

  return (
    <section className="round-detail">
      <header className="round-header">
        <h3>
          Round {round.number}: {won ? 'won' : 'lost'} by {round.result.toLowerCase()}
        </h3>
        <p className="muted">
          {side && `Your team on ${side}`}
          {round.ceremony && `${side ? ', ' : ''}${round.ceremony}${round.ceremonyPlayer ? ` by ${round.ceremonyPlayer.split('#')[0]}` : ''}`}
        </p>
      </header>

      {ally && enemy && (
        <div className="economy">
          <EconomyRow label="Your team" econ={ally} ally />
          <EconomyRow label="Enemy team" econ={enemy} />
        </div>
      )}

      <ol className="kill-feed">
        {timeline(round).map((event, i) =>
          event.type === 'kill' ? (
            <KillRow key={i} kill={event.kill} allyTeam={allyTeam} />
          ) : (
            <li key={i} className="spike-event">
              <span className="kill-time">{clock(event.timeMs)}</span>
              <span>{event.text}</span>
            </li>
          )
        )}
      </ol>
    </section>
  )
}

function EconomyRow({ label, econ, ally = false }: { label: string; econ: RoundLine['economy'][number]; ally?: boolean }) {
  return (
    <div className={`econ-row ${ally ? 'ally' : 'enemy'}`}>
      <span>{label}</span>
      <strong>{econ.buyType}</strong>
      <span className="muted">
        {econ.loadoutValue.toLocaleString()} loadout, {econ.spent.toLocaleString()} spent
      </span>
    </div>
  )
}

type TimelineEvent = { type: 'kill'; timeMs: number; kill: KillEvent } | { type: 'spike'; timeMs: number; text: string }

function timeline(round: RoundLine): TimelineEvent[] {
  const events: TimelineEvent[] = round.kills.map((k) => ({ type: 'kill', timeMs: k.timeMs, kill: k }))
  if (round.plant) {
    const by = round.plant.by ? ` by ${round.plant.by.split('#')[0]}` : ''
    events.push({ type: 'spike', timeMs: round.plant.timeMs, text: `Spike planted on ${round.plant.site}${by}` })
  }
  if (round.defuse) {
    const by = round.defuse.by ? ` by ${round.defuse.by.split('#')[0]}` : ''
    events.push({ type: 'spike', timeMs: round.defuse.timeMs, text: `Spike defused${by}` })
  }
  return events.sort((a, b) => a.timeMs - b.timeMs)
}

function KillRow({ kill, allyTeam }: { kill: KillEvent; allyTeam: string | undefined }) {
  const side = (teamId: string) => (teamId === allyTeam ? 'ally' : 'enemy')
  return (
    <li className="kill-row">
      <span className="kill-time">{clock(kill.timeMs)}</span>
      <span className={`kill-player ${kill.killer ? side(kill.killer.teamId) : ''}`}>
        {kill.killer?.agent && <img src={kill.killer.agent.icon} alt="" />}
        {kill.killer ? kill.killer.displayName.split('#')[0] : 'World'}
      </span>
      <span className="kill-cause" title={kill.cause?.name}>
        {kill.cause?.icon ? <img src={kill.cause.icon} alt={kill.cause.name} /> : <span>{kill.cause?.name ?? ''}</span>}
      </span>
      <span className={`kill-player ${side(kill.victim.teamId)}`}>
        {kill.victim.agent && <img src={kill.victim.agent.icon} alt="" />}
        {kill.victim.displayName.split('#')[0]}
      </span>
      <span className="kill-tags">
        {kill.isFirstBlood && <span className="badge">First blood</span>}
        {kill.assists > 0 && <span className="muted">+{kill.assists} assist{kill.assists > 1 ? 's' : ''}</span>}
      </span>
    </li>
  )
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
