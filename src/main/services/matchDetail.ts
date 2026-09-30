import type {
  BuyType,
  KillEvent,
  MatchAgentRef,
  MatchDetailView,
  MatchPlayerLine,
  MatchTeamLine,
  RoundLine
} from '../../shared/types'
import type { MatchDetails, MatchKill, MatchRound } from '../endpoints/player'
import type { ServiceContext } from './context'
import { outcomeFor, pct } from './playerStats'
import { queueName } from './queues'

const RESULT_TEXT: Record<string, string> = {
  Elimination: 'Elimination',
  Detonate: 'Spike detonated',
  Defuse: 'Spike defused',
  Surrendered: 'Surrender'
}

const CEREMONY_TEXT: Record<string, string> = {
  CeremonyAce: 'Ace',
  CeremonyTeamAce: 'Team ace',
  CeremonyFlawless: 'Flawless',
  CeremonyClutch: 'Clutch',
  CeremonyThrifty: 'Thrifty'
}

// Ability slot names used in kill data -> slot names in agent data.
const ABILITY_SLOTS: Record<string, string> = {
  Ability1: 'Ability1',
  Ability2: 'Ability2',
  GrenadeAbility: 'Grenade',
  Ultimate: 'Ultimate'
}

interface PlayerInfo {
  puuid: string
  displayName: string
  teamId: string
  agent: MatchAgentRef | null
  agentId: string
}

/** Everything about one finished match: scoreboard, round timeline, kill feed and economy. */
export class MatchDetailService {
  constructor(private readonly ctx: ServiceContext) {}

  async get(matchId: string, perspectivePuuid: string): Promise<MatchDetailView> {
    const { assets } = this.ctx
    const match = await this.ctx.matches.get(matchId)
    const info = match.matchInfo

    // Riot now leaves gameName/tagLine empty in match details, so names come from the name service.
    const names = await this.ctx.players.resolve(match.players.map((p) => p.subject)).catch(() => new Map())
    const players = new Map<string, PlayerInfo>()
    for (const p of match.players) {
      const agent = await assets.agent(p.characterId)
      const ref = names.get(p.subject)
      players.set(p.subject, {
        puuid: p.subject,
        displayName: ref?.gameName
          ? `${ref.gameName}#${ref.tagLine}`
          : p.gameName
            ? `${p.gameName}#${p.tagLine}`
            : 'Unknown player',
        teamId: p.teamId,
        agent: agent && { id: agent.id, name: agent.name, icon: agent.icon },
        agentId: p.characterId.toLowerCase()
      })
    }

    const perspective = match.players.find((p) => p.subject === perspectivePuuid)
    const rounds = await this.buildRounds(match, players)

    return {
      matchId: info.matchId,
      map: await assets.map(info.mapId),
      queue: queueName(info.queueID),
      startedAt: info.gameStartMillis,
      durationMs: info.gameLengthMillis ?? 0,
      isRanked: info.isRanked,
      completion: info.completionState || 'Completed',
      perspectivePuuid,
      outcome: perspective ? outcomeFor(match, perspective.teamId).outcome : null,
      teams: await this.buildTeams(match, rounds, players, perspectivePuuid),
      rounds
    }
  }

  private async buildTeams(
    match: MatchDetails,
    rounds: RoundLine[],
    players: Map<string, PlayerInfo>,
    perspectivePuuid: string
  ): Promise<MatchTeamLine[]> {
    const { assets } = this.ctx
    const stats = playerRoundStats(match, rounds)
    const partyGroups = partyGroupsFor(match)

    const lines: MatchPlayerLine[] = await Promise.all(
      match.players
        .filter((p) => p.stats)
        .map(async (p) => {
          const s = p.stats!
          const r = stats.get(p.subject)
          const agent = await assets.agent(p.characterId)
          return {
            puuid: p.subject,
            displayName: players.get(p.subject)?.displayName ?? 'Unknown player',
            teamId: p.teamId,
            agent: agent && { id: agent.id, name: agent.name, icon: agent.icon },
            rank: match.matchInfo.isRanked || p.competitiveTier > 0 ? await assets.rank(p.competitiveTier) : null,
            accountLevel: p.accountLevel,
            acs: s.roundsPlayed > 0 ? Math.round(s.score / s.roundsPlayed) : 0,
            kills: s.kills,
            deaths: s.deaths,
            assists: s.assists,
            plusMinus: s.kills - s.deaths,
            adr: r && s.roundsPlayed > 0 && r.hasRounds ? Math.round(r.damage / s.roundsPlayed) : null,
            headshotPct: r && r.shots > 0 ? pct(r.headshots, r.shots) : null,
            firstKills: r?.firstKills ?? 0,
            firstDeaths: r?.firstDeaths ?? 0,
            plants: r?.plants ?? 0,
            defuses: r?.defuses ?? 0,
            multiKills: r?.multiKills ?? 0,
            partyGroup: partyGroups.get(p.subject) ?? null,
            isPerspective: p.subject === perspectivePuuid,
            isMatchMvp: false,
            isTeamMvp: false
          }
        })
    )

    const rawTeams = match.teams ?? []
    const perspectiveTeam = match.players.find((p) => p.subject === perspectivePuuid)?.teamId
    const byAcs = (a: MatchPlayerLine, b: MatchPlayerLine) => b.acs - a.acs

    let teams: MatchTeamLine[]
    if (rawTeams.length === 2) {
      teams = rawTeams.map((t) => ({
        teamId: t.teamId,
        won: t.won,
        roundsWon: t.roundsWon,
        isPerspective: t.teamId === perspectiveTeam,
        players: lines.filter((l) => l.teamId === t.teamId).sort(byAcs)
      }))
      teams.sort((a, b) => Number(b.isPerspective) - Number(a.isPerspective))
    } else {
      // Free-for-all modes (deathmatch): one list ordered by kills.
      teams = [
        {
          teamId: 'all',
          won: rawTeams.find((t) => t.teamId === perspectiveTeam)?.won ?? false,
          roundsWon: 0,
          isPerspective: true,
          players: [...lines].sort((a, b) => b.kills - a.kills || byAcs(a, b))
        }
      ]
    }

    // Match MVP: Riot's pick when provided, else top combat score. Team MVP: best player on each other team.
    const mvp = match.matchMvp ?? [...lines].sort(byAcs)[0]?.puuid
    for (const team of teams) {
      const mvpHere = team.players.find((p) => p.puuid === mvp)
      if (mvpHere) mvpHere.isMatchMvp = true
      else if (team.players[0] && teams.length > 1) team.players[0].isTeamMvp = true
    }
    return teams
  }

  private async buildRounds(match: MatchDetails, players: Map<string, PlayerInfo>): Promise<RoundLine[]> {
    const teamIds = (match.teams ?? []).map((t) => t.teamId)
    const nameOf = (puuid: string | undefined) => (puuid ? (players.get(puuid)?.displayName ?? null) : null)

    const lines = await Promise.all(
      (match.roundResults ?? []).map(async (round): Promise<RoundLine> => {
        const kills = await this.buildKills(round, players)
        const otherTeam = teamIds.find((t) => t !== round.winningTeam) ?? null
        const attackingTeamId =
          teamIds.length !== 2 || !round.winningTeamRole
            ? null
            : round.winningTeamRole === 'Attacker'
              ? round.winningTeam
              : otherTeam

        return {
          number: round.roundNum + 1,
          winningTeamId: round.winningTeam,
          attackingTeamId,
          result: RESULT_TEXT[round.roundResultCode] ?? (round.roundResult === 'Round timer expired' ? 'Time ran out' : round.roundResult),
          ceremony: CEREMONY_TEXT[round.roundCeremony] ?? null,
          ceremonyPlayer: CEREMONY_TEXT[round.roundCeremony] ? nameOf(round.ceremonyPlayer) : null,
          plant: round.plantSite
            ? { site: round.plantSite, timeMs: round.plantRoundTime ?? 0, by: nameOf(round.bombPlanter) }
            : null,
          defuse: round.bombDefuser ? { timeMs: round.defuseRoundTime ?? 0, by: nameOf(round.bombDefuser) } : null,
          economy: teamIds.length === 2 ? economyFor(round, players, teamIds) : [],
          kills
        }
      })
    )
    markPistolRounds(lines)
    return lines
  }

  private async buildKills(round: MatchRound, players: Map<string, PlayerInfo>): Promise<KillEvent[]> {
    const all: MatchKill[] = round.playerStats.flatMap((ps) => ps.kills ?? []).sort((a, b) => a.roundTime - b.roundTime)
    const ref = (puuid: string) => {
      const p = players.get(puuid)
      return {
        puuid,
        displayName: p?.displayName ?? 'Unknown player',
        agent: p?.agent ?? null,
        teamId: p?.teamId ?? ''
      }
    }
    return Promise.all(
      all.map(async (k, i) => ({
        timeMs: k.roundTime,
        killer: k.killer ? ref(k.killer) : null,
        victim: ref(k.victim),
        cause: await this.killCause(k, players.get(k.killer)?.agentId),
        assists: k.assistants?.length ?? 0,
        isFirstBlood: i === 0
      }))
    )
  }

  private async killCause(kill: MatchKill, killerAgentId: string | undefined): Promise<KillEvent['cause']> {
    const { damageType, damageItem } = kill.finishingDamage
    switch (damageType) {
      case 'Weapon': {
        const weapon = await this.ctx.assets.weapon(damageItem)
        return weapon ? { name: weapon.name, icon: weapon.icon } : { name: 'Weapon', icon: null }
      }
      case 'Ability': {
        const slot = ABILITY_SLOTS[damageItem]
        const agent = killerAgentId ? await this.ctx.assets.agent(killerAgentId) : null
        const ability = agent?.abilities.find((a) => a.slot === slot)
        return ability ? { name: ability.name, icon: ability.icon } : { name: 'Ability', icon: null }
      }
      case 'Bomb':
        return { name: 'Spike', icon: null }
      case 'Fall':
        return { name: 'Fall damage', icon: null }
      case 'Melee':
        return { name: 'Melee', icon: null }
      default:
        return null
    }
  }
}

interface RoundStats {
  damage: number
  headshots: number
  shots: number
  hasRounds: boolean
  firstKills: number
  firstDeaths: number
  plants: number
  defuses: number
  multiKills: number
}

function playerRoundStats(match: MatchDetails, rounds: RoundLine[]): Map<string, RoundStats> {
  const stats = new Map<string, RoundStats>()
  const get = (puuid: string) => {
    let s = stats.get(puuid)
    if (!s) {
      s = { damage: 0, headshots: 0, shots: 0, hasRounds: false, firstKills: 0, firstDeaths: 0, plants: 0, defuses: 0, multiKills: 0 }
      stats.set(puuid, s)
    }
    return s
  }

  for (const round of match.roundResults ?? []) {
    for (const ps of round.playerStats) {
      const s = get(ps.subject)
      s.hasRounds = true
      for (const d of ps.damage ?? []) {
        s.damage += d.damage
        s.headshots += d.headshots
        s.shots += d.headshots + d.bodyshots + d.legshots
      }
      if ((ps.kills?.length ?? 0) >= 3) s.multiKills++
    }
    if (round.bombPlanter) get(round.bombPlanter).plants++
    if (round.bombDefuser) get(round.bombDefuser).defuses++
  }

  for (const round of rounds) {
    const first = round.kills[0]
    if (!first) continue
    if (first.killer) get(first.killer.puuid).firstKills++
    get(first.victim.puuid).firstDeaths++
  }
  return stats
}

/** Numbers players who queued together (shared party ID); solo players get none. */
function partyGroupsFor(match: MatchDetails): Map<string, number> {
  const members = new Map<string, string[]>()
  for (const p of match.players) members.set(p.partyId, [...(members.get(p.partyId) ?? []), p.subject])
  const groups = new Map<string, number>()
  let next = 1
  for (const puuids of members.values()) {
    if (puuids.length < 2) continue
    for (const id of puuids) groups.set(id, next)
    next++
  }
  return groups
}

function economyFor(round: MatchRound, players: Map<string, PlayerInfo>, teamIds: string[]): RoundLine['economy'] {
  return teamIds.map((teamId) => {
    let loadoutValue = 0
    let spent = 0
    for (const ps of round.playerStats) {
      if (players.get(ps.subject)?.teamId !== teamId || !ps.economy) continue
      loadoutValue += ps.economy.loadoutValue
      spent += ps.economy.spent
    }
    return { teamId, loadoutValue, spent, buyType: buyType(loadoutValue) }
  })
}

/** The first round and the first round after the side swap are pistol rounds. */
function markPistolRounds(rounds: RoundLine[]): void {
  if (rounds.length === 0 || rounds[0].economy.length === 0) return
  const swap = rounds.findIndex((r) => r.attackingTeamId && r.attackingTeamId !== rounds[0].attackingTeamId)
  for (const i of [0, swap]) {
    if (i < 0 || !rounds[0].attackingTeamId) continue
    for (const e of rounds[i].economy) e.buyType = 'Pistol'
  }
}

// Common community thresholds for a 5-player team's total loadout value.
function buyType(teamLoadout: number): BuyType {
  if (teamLoadout < 5000) return 'Eco'
  if (teamLoadout < 10000) return 'Semi-eco'
  if (teamLoadout < 20000) return 'Semi-buy'
  return 'Full buy'
}
