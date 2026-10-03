import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { httpRequest } from '../core/http'
import type { MapInfo, RankInfo } from '../../shared/types'

// Names, icons and colors for game content, from the community-run https://valorant-api.com.
// Riot's own endpoints return only UUIDs; this turns them into something displayable.

const BASE = 'https://valorant-api.com/v1'
// Bump when the cached data shape changes, so old cache files are ignored.
const CACHE_SCHEMA = 4

export interface AbilityData {
  /** "Ability1" | "Ability2" | "Grenade" | "Ultimate" | "Passive" */
  slot: string
  name: string
  icon: string | null
}

export interface AgentData {
  id: string
  name: string
  icon: string
  role: string | null
  isBaseContent: boolean
  abilities: AbilityData[]
}

export interface WeaponData {
  name: string
  /** Kill-feed silhouette. */
  icon: string | null
}

export interface SkinLevelData {
  name: string
  icon: string | null
  rarityColor: string | null
}

export interface ActData {
  /** e.g. "V26 Act V" or "Episode 5 Act II" */
  name: string
  start: number | null
  end: number | null
  /** Which rank table this act used (rank names changed over time). */
  tiersUuid: string | null
}

export interface CurrencyData {
  name: string
  icon: string | null
}

interface StaticDataSet {
  version: string
  agents: AgentData[]
  maps: Record<string, MapInfo> // keyed by mapUrl, e.g. "/Game/Maps/Ascent/Ascent"
  tiers: Record<number, RankInfo>
  skinLevels: Record<string, SkinLevelData> // keyed by skin level UUID (= store offer item ID)
  currencies: Record<string, CurrencyData>
  weapons: Record<string, WeaponData> // keyed by lower-case weapon UUID
  acts: Record<string, ActData> // keyed by season UUID
  tierSets: Record<string, Record<number, RankInfo>> // keyed by competitive tiers UUID
  titles: Record<string, string> // keyed by lower-case player title UUID; untitled entries left out
}

type ApiResponse<T> = { status: number; data: T }

/** `59a9b6ff` -> `#59a9b6` */
function color(rgba: string | null | undefined): string | null {
  return rgba ? `#${rgba.slice(0, 6)}` : null
}

async function get<T>(path: string): Promise<T> {
  const res = await httpRequest<ApiResponse<T>>({ url: BASE + path, method: 'GET', timeoutMs: 30_000 })
  return res.data
}

export class StaticData {
  private data: StaticDataSet | null = null
  private loading: Promise<StaticDataSet> | null = null

  /** @param cacheDir where to cache downloaded data between runs (optional). */
  constructor(private readonly cacheDir?: string) {}

  /** Loads (once) and returns the data set. Safe to call concurrently. */
  load(): Promise<StaticDataSet> {
    if (this.data) return Promise.resolve(this.data)
    this.loading ??= this.fetchOrReadCache()
      .then((d) => (this.data = d))
      .finally(() => (this.loading = null))
    return this.loading
  }

  async agents(): Promise<AgentData[]> {
    return (await this.load()).agents
  }

  async agent(id: string): Promise<AgentData | null> {
    const lower = id.toLowerCase()
    return (await this.load()).agents.find((a) => a.id === lower) ?? null
  }

  async map(mapUrl: string): Promise<MapInfo> {
    const found = (await this.load()).maps[mapUrl]
    if (found) return found
    const fallbackName = mapUrl.split('/').pop() || 'Unknown map'
    return { id: mapUrl, name: fallbackName, splash: null, icon: null }
  }

  async rank(tier: number): Promise<RankInfo> {
    return (await this.load()).tiers[tier] ?? { tier, name: 'Unranked', icon: null, color: null }
  }

  async act(seasonId: string): Promise<ActData | null> {
    return (await this.load()).acts[seasonId.toLowerCase()] ?? null
  }

  /** The act running right now (lower-case season UUID), or null if the data doesn't cover today. */
  async currentActId(now = Date.now()): Promise<string | null> {
    const acts = Object.entries((await this.load()).acts)
    const current = acts.find(([, a]) => a.start !== null && a.end !== null && a.start <= now && now < a.end)
    return current?.[0] ?? null
  }

  /** The rank as it was named in a given act (before Episode 5 there was no Ascendant, for example). */
  async rankInAct(tier: number, seasonId: string): Promise<RankInfo> {
    const data = await this.load()
    const act = data.acts[seasonId.toLowerCase()]
    const set = act?.tiersUuid ? data.tierSets[act.tiersUuid] : undefined
    return set?.[tier] ?? (await this.rank(tier))
  }

  /** Converts a tier from any act to today's tier scale, so ranks from different eras compare correctly. */
  async normalizeTier(tier: number, seasonId: string): Promise<number> {
    const data = await this.load()
    const name = (await this.rankInAct(tier, seasonId)).name
    const current = Object.values(data.tiers).find((t) => t.name === name)
    return current?.tier ?? tier
  }

  async skinLevel(id: string): Promise<SkinLevelData | null> {
    return (await this.load()).skinLevels[id] ?? null
  }

  async weapon(id: string): Promise<WeaponData | null> {
    return (await this.load()).weapons[id.toLowerCase()] ?? null
  }

  async currency(id: string): Promise<CurrencyData> {
    return (await this.load()).currencies[id] ?? { name: 'Unknown currency', icon: null }
  }

  /** Text of an equipped player title, e.g. "Sharpshooter"; null for none or unknown. */
  async title(id: string): Promise<string | null> {
    return (await this.load()).titles[id.toLowerCase()] ?? null
  }

  private async fetchOrReadCache(): Promise<StaticDataSet> {
    const { riotClientVersion } = await get<{ riotClientVersion: string }>('/version')
    const cachePath = this.cacheDir ? join(this.cacheDir, `static-v${CACHE_SCHEMA}-${riotClientVersion}.json`) : null

    if (cachePath) {
      try {
        return JSON.parse(await readFile(cachePath, 'utf8')) as StaticDataSet
      } catch {
        // no cache for this game version yet
      }
    }

    const data = await this.fetchAll(riotClientVersion)
    if (cachePath && this.cacheDir) {
      await mkdir(this.cacheDir, { recursive: true })
      await writeFile(cachePath, JSON.stringify(data))
    }
    return data
  }

  private async fetchAll(version: string): Promise<StaticDataSet> {
    const [agents, maps, tierSets, skins, contentTiers, currencies, weapons, seasons, compSeasons, titles] = await Promise.all([
      get<RawAgent[]>('/agents?isPlayableCharacter=true'),
      get<RawMap[]>('/maps'),
      get<RawTierSet[]>('/competitivetiers'),
      get<RawSkin[]>('/weapons/skins'),
      get<RawContentTier[]>('/contenttiers'),
      get<RawCurrency[]>('/currencies'),
      get<RawWeapon[]>('/weapons'),
      get<RawSeason[]>('/seasons'),
      get<RawCompetitiveSeason[]>('/seasons/competitive'),
      get<RawTitle[]>('/playertitles')
    ])

    const rarity = new Map(contentTiers.map((t) => [t.uuid, color(t.highlightColor)]))
    const skinLevels: Record<string, SkinLevelData> = {}
    for (const skin of skins) {
      for (const level of skin.levels) {
        skinLevels[level.uuid] = {
          name: skin.displayName,
          icon: level.displayIcon ?? skin.displayIcon,
          rarityColor: skin.contentTierUuid ? (rarity.get(skin.contentTierUuid) ?? null) : null
        }
      }
    }

    const latestTiers = tierSets[tierSets.length - 1]?.tiers ?? []
    const toRankTable = (tiers: RawTierSet['tiers']): Record<number, RankInfo> =>
      Object.fromEntries(
        tiers.map((t) => [
          t.tier,
          { tier: t.tier, name: titleCase(t.tierName), icon: t.largeIcon ?? t.smallIcon, color: color(t.color) }
        ])
      )

    const seasonById = new Map(seasons.map((x) => [x.uuid.toLowerCase(), x]))
    const tiersBySeason = new Map(compSeasons.map((c) => [c.seasonUuid.toLowerCase(), c.competitiveTiersUuid]))
    const acts: Record<string, ActData> = {}
    for (const season of seasons) {
      if (season.type !== 'EAresSeasonType::Act') continue
      const episode = season.parentUuid ? seasonById.get(season.parentUuid.toLowerCase()) : undefined
      acts[season.uuid.toLowerCase()] = {
        name: [episode && titleCase(episode.displayName), titleCase(season.displayName)].filter(Boolean).join(' '),
        start: season.startTime ? Date.parse(season.startTime) : null,
        end: season.endTime ? Date.parse(season.endTime) : null,
        tiersUuid: tiersBySeason.get(season.uuid.toLowerCase()) ?? null
      }
    }

    return {
      version,
      agents: agents
        .map((a) => ({
          id: a.uuid.toLowerCase(),
          name: a.displayName,
          icon: a.displayIcon,
          role: a.role?.displayName ?? null,
          isBaseContent: a.isBaseContent,
          abilities: (a.abilities ?? []).map((ab) => ({ slot: ab.slot, name: ab.displayName, icon: ab.displayIcon }))
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      maps: Object.fromEntries(
        maps.map((m) => [m.mapUrl, { id: m.uuid, name: m.displayName, splash: m.splash, icon: m.listViewIcon }])
      ),
      tiers: toRankTable(latestTiers),
      tierSets: Object.fromEntries(tierSets.map((set) => [set.uuid, toRankTable(set.tiers)])),
      acts,
      skinLevels,
      currencies: Object.fromEntries(
        currencies.map((c) => [c.uuid, { name: titleCase(c.displayName), icon: c.displayIcon }])
      ),
      titles: Object.fromEntries(
        titles.filter((t) => t.titleText).map((t) => [t.uuid.toLowerCase(), t.titleText as string])
      ),
      weapons: Object.fromEntries(
        weapons.map((w) => [w.uuid.toLowerCase(), { name: w.displayName, icon: w.killStreamIcon ?? w.displayIcon }])
      )
    }
  }
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (r) => r.toUpperCase())
}

interface RawAgent {
  uuid: string
  displayName: string
  displayIcon: string
  isBaseContent: boolean
  role: { displayName: string } | null
  abilities: { slot: string; displayName: string; displayIcon: string | null }[] | null
}
interface RawSeason {
  uuid: string
  displayName: string
  /** "EAresSeasonType::Act" or "EAresSeasonType::Episode" (null for newer episodes) */
  type: string | null
  startTime: string | null
  endTime: string | null
  parentUuid: string | null
}
interface RawCompetitiveSeason {
  seasonUuid: string
  competitiveTiersUuid: string | null
}
interface RawWeapon {
  uuid: string
  displayName: string
  displayIcon: string | null
  killStreamIcon: string | null
}
interface RawMap {
  uuid: string
  displayName: string
  mapUrl: string
  splash: string | null
  listViewIcon: string | null
}
interface RawTierSet {
  uuid: string
  tiers: { tier: number; tierName: string; color: string | null; smallIcon: string | null; largeIcon: string | null }[]
}
interface RawSkin {
  displayName: string
  displayIcon: string | null
  contentTierUuid: string | null
  levels: { uuid: string; displayIcon: string | null }[]
}
interface RawContentTier {
  uuid: string
  highlightColor: string
}
interface RawTitle {
  uuid: string
  titleText: string | null
}

interface RawCurrency {
  uuid: string
  displayName: string
  displayIcon: string | null
}
