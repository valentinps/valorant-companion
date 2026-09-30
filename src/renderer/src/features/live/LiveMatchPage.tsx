import { useCommand, useStatus } from '../../api'
import { EmptyState, ErrorNote, PageHeader, PlayerName, RankBadge } from '../../components/ui'
import { PlayerLink } from '../profile/PlayerLink'

export function LiveMatchPage() {
  const status = useStatus()
  const inGame = status.phase === 'INGAME'
  const live = useCommand('live.get', [], { enabled: inGame, refreshOn: ['coregame'], intervalMs: 30_000 })
  const match = live.data

  if (!inGame || !match) {
    return (
      <div className="page">
        <PageHeader title="Live match" />
        <EmptyState title="Not in a match">When your game starts, both teams and their agents will show up here.</EmptyState>
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
                  {/* Opponents' profiles aren't opened mid-match: no scouting. */}
                  {team.isAlly ? (
                    <PlayerLink puuid={p.puuid} displayName={p.displayName} isSelf={p.isSelf} />
                  ) : (
                    <PlayerName slot={p} />
                  )}
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
