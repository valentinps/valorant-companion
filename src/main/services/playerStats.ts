import type {
  AgentUsage,
  MatchOutcome,
  PeakRank,
  PlayerProfileView,
  ProfileMatch,
  ProfileStats
} from '../../shared/types'
import { TtlCache } from '../core/cache'
import { ApiError } from '../core/errors'
import { Player } from '../endpoints'
import type { CompetitiveUpdate, MatchDetails, MmrResponse } from '../endpoints/player'
import type { ServiceContext } from './context'
import { queueName } from './queues'

const MAX_MATCHES = 20
const DETAILS_CONCURRENCY = 3
const MINUTE = 60_000
/** The most ranked games Riot returns per request; older rank history isn't reachable. */
const RANK_HISTORY_SIZE = 20
// Tiers 0-2 are "Unranked" and two unused slots.
const FIRST_REAL_TIER = 3

type History = { MatchID: string }[]

/** Per-match numbers for one player, computed from match details. */
interface PlayerMatchLine {
  match: MatchDetails
  characterId: string
  outcome: MatchOutcome
  score: string | null
  kills: number
  deaths: number
  assists: number
  combatScore: number
  rounds: number
  damage: number | null
  shots: { head: number; total: number } | null
}

interface Identity {
  cardImage: string | null
  accountLevel: number | null
}

/**
 * Player profiles computed from Riot's own match data, with no third-party tracker needed.
 * Everything is cached briefly so flipping between game modes doesn't hammer Riot's rate limits.
 */
export class PlayerStatsService {
  private mmr = new TtlCache<string, MmrResponse>(2 * MINUTE)
  private history = new TtlCache<string, History>(MINUTE)
  private compUpdates = new TtlCache<string, CompetitiveUpdate[]>(MINUTE)
  private identity = new TtlCache<string, Identity>(10 * MINUTE)

  constructor(private readonly ctx: ServiceContext) {}

  async profile(puuid: string, queue: string | null, count: number): Promise<PlayerProfileView> {
    const { assets, players, session } = this.ctx
    const isSelf = puuid === session.requireInfo().puuid
    const n = Math.min(Math.max(1, Math.floor(count)), MAX_MATCHES)

    const [player, mmr, history, rrChanges, identity] = await Promise.all([
      players.resolveOne(puuid),
      this.getMmr(puuid).catch(() => null),
      this.getHistory(puuid, queue, n),
      this.getCompUpdates(puuid, queue, n)
        .then((list) => new Map(list.map((m) => [m.MatchID, m.RankedRatingEarned])))
        .catch(() => new Map<string, number>()),
      this.getIdentity(puuid).catch((): Identity => ({ cardImage: null, accountLevel: null }))
    ])

    const details = await mapLimit(history, DETAILS_CONCURRENCY, (h) => this.matchDetails(h.MatchID))
    const lines = details
      .map((d) => (d ? lineFor(d, puuid) : null))
      .filter((l): l is PlayerMatchLine => l !== null)

    const latest = mmr?.LatestCompetitiveUpdate

    const matches: ProfileMatch[] = await Promise.all(
      lines.map(async (l) => {
        const agent = await assets.agent(l.characterId)
        return {
          matchId: l.match.matchInfo.matchId,
          map: await assets.map(l.match.matchInfo.mapId),
          queue: queueName(l.match.matchInfo.queueID),
          startedAt: l.match.matchInfo.gameStartMillis,
          agent: agent && { id: agent.id, name: agent.name, icon: agent.icon },
          outcome: l.outcome,
          score: l.score,
          kills: l.kills,
          deaths: l.deaths,
          assists: l.assists,
          acs: l.rounds > 0 ? Math.round(l.combatScore / l.rounds) : 0,
          headshotPct: l.shots && l.shots.total > 0 ? pct(l.shots.head, l.shots.total) : null,
          rrChange: l.match.matchInfo.isRanked ? (rrChanges.get(l.match.matchInfo.matchId) ?? null) : null
        }
      })
    )

    return {
      puuid,
      player,
      isSelf,
      cardImage: identity.cardImage,
      accountLevel: identity.accountLevel,
      rank: mmr ? await assets.rank(latest?.TierAfterUpdate ?? 0) : null,
      rankedRating: latest ? latest.RankedRatingAfterUpdate : null,
      rankUnavailable: mmr === null,
      peakRank: mmr ? await this.peakRank(puuid, mmr).catch(() => null) : null,
      stats: summarize(lines),
      topAgents: await topAgents(lines, this.ctx),
      matches,
      trackerUrl: `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(`${player.gameName}#${player.tagLine}`)}/overview`
    }
  }

  private getMmr(puuid: string): Promise<MmrResponse> {
    return this.mmr.getOrLoadWithFallback(puuid, () => this.ctx.api.call(Player.getMmr, { puuid }))
  }

  private getHistory(puuid: string, queue: string | null, n: number): Promise<History> {
    return this.history.getOrLoadWithFallback(`${puuid}|${queue ?? ''}|${n}`, async () => {
      const res = await this.ctx.api.call(Player.getMatchHistory, { puuid, start: 0, end: n, queue: queue ?? undefined })
      return res.History
    })
  }

  private getCompUpdates(puuid: string, queue: string | null, n: number): Promise<CompetitiveUpdate[]> {
    return this.compUpdates.getOrLoadWithFallback(`${puuid}|${queue ?? ''}|${n}`, async () => {
      const res = await this.ctx.api.call(Player.getCompetitiveUpdates, {
        puuid,
        start: 0,
        end: n,
        queue: queue ?? undefined
      })
      return res.Matches
    })
  }

  /**
   * All-time peak: for each act, the best of its final rank and the highest tier the player won a game at.
   * Tiers are compared on today's scale, since rank names shifted when Ascendant was added.
   */
  private async peakRank(puuid: string, mmr: MmrResponse): Promise<PeakRank | null> {
    const { assets } = this.ctx
    const seasons = Object.values(mmr.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {})

    const perAct: { seasonId: string; tier: number; normalized: number }[] = []
    for (const season of seasons) {
      const candidates = [
        season.CompetitiveTier,
        season.Rank,
        ...Object.keys(season.WinsByTier ?? {}).map(Number)
      ].filter((t) => Number.isFinite(t) && t >= FIRST_REAL_TIER)
      if (candidates.length === 0) continue
      const tier = Math.max(...candidates)
      perAct.push({ seasonId: season.SeasonID, tier, normalized: await assets.normalizeTier(tier, season.SeasonID) })
    }
    if (perAct.length === 0) return null

    const best = Math.max(...perAct.map((a) => a.normalized))
    const reachedIn = perAct.filter((a) => a.normalized === best)
    // Show the most recent act it was reached in.
    const withActs = await Promise.all(reachedIn.map(async (a) => ({ ...a, act: await assets.act(a.seasonId) })))
    withActs.sort((a, b) => (b.act?.start ?? 0) - (a.act?.start ?? 0))
    const peak = withActs[0]

    return {
      rank: await assets.rankInAct(peak.tier, peak.seasonId),
      act: peak.act?.name ?? 'Unknown act',
      actStart: peak.act?.start ?? null,
      actEnd: peak.act?.end ?? null,
      reachedAt: await this.peakDate(puuid, peak.seasonId, peak.tier),
      timesReached: reachedIn.length
    }
  }

  /** The day the peak was first reached in that act, if it's within Riot's recent rank history. */
  private async peakDate(puuid: string, seasonId: string, tier: number): Promise<number | null> {
    const updates = await this.getCompUpdates(puuid, 'competitive', RANK_HISTORY_SIZE).catch(() => [])
    const hits = updates.filter((u) => u.SeasonID === seasonId && u.TierAfterUpdate === tier && u.TierBeforeUpdate < tier)
    if (hits.length === 0) return null
    return Math.min(...hits.map((u) => u.MatchStartTime))
  }

  /** Player card and level come from their latest match in any mode, independent of the mode filter. */
  private getIdentity(puuid: string): Promise<Identity> {
    return this.identity.getOrLoadWithFallback(puuid, async () => {
      const [latest] = await this.getHistory(puuid, null, 1)
      const match = latest ? await this.matchDetails(latest.MatchID) : null
      const p = match?.players.find((x) => x.subject === puuid)
      return {
        cardImage: p?.playerCard ? `https://media.valorant-api.com/playercards/${p.playerCard}/wideart.png` : null,
        accountLevel: p?.accountLevel ?? null
      }
    })
  }

  private async matchDetails(matchId: string): Promise<MatchDetails | null> {
    try {
      return await this.ctx.matches.get(matchId)
    } catch (err) {
      // A single unavailable match shouldn't break the whole profile.
      if (err instanceof ApiError && err.status !== 429) return null
      throw err
    }
  }
}

export function outcomeFor(match: MatchDetails, teamId: string): { outcome: MatchOutcome; score: string | null } {
  const teams = match.teams ?? []
  const own = teams.find((t) => t.teamId === teamId)
  const others = teams.filter((t) => t.teamId !== teamId)
  const outcome: MatchOutcome = own?.won ? 'win' : others.some((t) => t.won) ? 'loss' : 'draw'
  const score = teams.length === 2 && own && others[0] ? `${own.roundsWon}-${others[0].roundsWon}` : null
  return { outcome, score }
}

function lineFor(match: MatchDetails, puuid: string): PlayerMatchLine | null {
  const p = match.players.find((x) => x.subject === puuid)
  if (!p?.stats) return null
  const { outcome, score } = outcomeFor(match, p.teamId)

  let damage = 0
  let head = 0
  let total = 0
  let hasRounds = false
  for (const round of match.roundResults ?? []) {
    const ps = round.playerStats.find((s) => s.subject === puuid)
    if (!ps) continue
    hasRounds = true
    for (const d of ps.damage ?? []) {
      damage += d.damage
      head += d.headshots
      total += d.headshots + d.bodyshots + d.legshots
    }
  }

  return {
    match,
    characterId: p.characterId,
    outcome,
    score,
    kills: p.stats.kills,
    deaths: p.stats.deaths,
    assists: p.stats.assists,
    combatScore: p.stats.score,
    rounds: p.stats.roundsPlayed,
    damage: hasRounds ? damage : null,
    shots: hasRounds ? { head, total } : null
  }
}

function summarize(lines: PlayerMatchLine[]): ProfileStats | null {
  if (lines.length === 0) return null
  const sum = (f: (l: PlayerMatchLine) => number) => lines.reduce((acc, l) => acc + f(l), 0)
  const kills = sum((l) => l.kills)
  const deaths = sum((l) => l.deaths)
  const assists = sum((l) => l.assists)
  const rounds = sum((l) => l.rounds)
  const wins = lines.filter((l) => l.outcome === 'win').length
  const withDamage = lines.filter((l) => l.damage !== null)
  const damageRounds = withDamage.reduce((a, l) => a + l.rounds, 0)
  const head = sum((l) => l.shots?.head ?? 0)
  const shots = sum((l) => l.shots?.total ?? 0)

  return {
    matches: lines.length,
    wins,
    winRate: pct(wins, lines.length),
    kd: round2(kills / Math.max(1, deaths)),
    kda: { kills, deaths, assists },
    acs: rounds > 0 ? Math.round(sum((l) => l.combatScore) / rounds) : 0,
    adr: damageRounds > 0 ? Math.round(withDamage.reduce((a, l) => a + (l.damage ?? 0), 0) / damageRounds) : null,
    headshotPct: shots > 0 ? pct(head, shots) : null
  }
}

async function topAgents(lines: PlayerMatchLine[], ctx: ServiceContext): Promise<AgentUsage[]> {
  const byAgent = new Map<string, { games: number; wins: number; kills: number; deaths: number }>()
  for (const l of lines) {
    const id = l.characterId.toLowerCase()
    const a = byAgent.get(id) ?? { games: 0, wins: 0, kills: 0, deaths: 0 }
    a.games++
    if (l.outcome === 'win') a.wins++
    a.kills += l.kills
    a.deaths += l.deaths
    byAgent.set(id, a)
  }
  const top = [...byAgent.entries()].sort((a, b) => b[1].games - a[1].games).slice(0, 3)
  const result: AgentUsage[] = []
  for (const [id, a] of top) {
    const agent = await ctx.assets.agent(id)
    if (!agent) continue
    result.push({
      agent: { id: agent.id, name: agent.name, icon: agent.icon },
      games: a.games,
      wins: a.wins,
      kd: round2(a.kills / Math.max(1, a.deaths))
    })
  }
  return result
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export const pct = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
