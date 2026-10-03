import { useState } from 'react'
import { useCommand, useStatus } from '../../api'
import { EmptyState, ErrorNote, PageHeader, RankBadge } from '../../components/ui'
import { PlayerLink } from '../profile/PlayerLink'

export function LiveMatchPage() {
  const status = useStatus()
  const inGame = status.phase === 'INGAME'
  const [hasMatch, setHasMatch] = useState(false)
  // Poll quickly until the match shows up (it can lag a moment behind the loading screen), then relax.
  const live = useCommand('live.get', [], {
    enabled: inGame,
    refreshOn: ['coregame'],
    intervalMs: hasMatch ? 30_000 : 3000
  })
  const match = live.data
  if (hasMatch !== (inGame && !!match)) setHasMatch(inGame && !!match)

  if (!inGame || !match) {
    return (
      <div className="page">
        <PageHeader title="Live match" />
        <EmptyState title="Not in a match">As soon as the loading screen starts, both teams, their agents and ranks will show up here.</EmptyState>
        <ErrorNote message={inGame ? live.error : null} />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title={match.map.name} aside={<span className="muted">{match.queue}</span>} />
      <div className="live-teams">
        {match.teams.map((team) => (
          <section key={team.teamId} className={`live-team ${team.isAlly ? 'ally' : 'enemy'}`}>
            <h3 className="section-title">{team.isAlly ? 'Your team' : 'Enemy team'}</h3>
            {team.players.map((p) => (
              <div key={p.puuid} className={`team-row ${p.isSelf ? 'is-self' : ''}`}>
                <div className="team-agent">{p.agent && <img src={p.agent.icon} alt="" />}</div>
                <div className="team-info">
                  <PlayerLink puuid={p.puuid} displayName={p.displayName} isSelf={p.isSelf} />
                  <span className="muted">
                    {p.agent?.name ?? 'Unknown agent'}
                    {p.accountLevel != null && `, level ${p.accountLevel}`}
                  </span>
                </div>
                <RankBadge rank={p.rank} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
