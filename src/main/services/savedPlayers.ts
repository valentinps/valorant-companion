import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PlayerProfileView, PlayerRef, SavedPlayer, SavedSnapshot } from '../../shared/types'

/**
 * Players the user chose to keep track of, stored as JSON on disk.
 * Each entry keeps a snapshot of the last profile loaded for that player, so the
 * saved list shows without any Riot requests and stays usable while rate limited.
 */
export class SavedPlayersService {
  private entries: SavedPlayer[] | null = null
  private writing: Promise<void> = Promise.resolve()

  /**
   * @param filePath where to persist the list; kept in memory only when omitted.
   * @param onChange called after every change, to let the UI refresh.
   */
  constructor(
    private readonly filePath: string | undefined,
    private readonly onChange: () => void = () => {}
  ) {}

  async list(): Promise<SavedPlayer[]> {
    return [...(await this.load())].sort((a, b) => b.savedAt - a.savedAt)
  }

  async isSaved(puuid: string): Promise<boolean> {
    return (await this.load()).some((e) => e.puuid === puuid)
  }

  async add(puuid: string, player: PlayerRef | null, hidden: boolean): Promise<void> {
    const entries = await this.load()
    if (entries.some((e) => e.puuid === puuid)) return
    entries.push({ puuid, player: hidden ? null : player, hidden, savedAt: Date.now(), snapshot: null })
    await this.persist()
  }

  async remove(puuid: string): Promise<void> {
    const entries = await this.load()
    const next = entries.filter((e) => e.puuid !== puuid)
    if (next.length === entries.length) return
    this.entries = next
    await this.persist()
  }

  /** Refreshes a saved player's snapshot from a freshly loaded competitive profile. No-op if not saved. */
  async recordSnapshot(view: PlayerProfileView): Promise<void> {
    const entry = (await this.load()).find((e) => e.puuid === view.puuid)
    if (!entry) return
    // Riot IDs can change; keep the latest one (never for players saved in streamer mode).
    if (view.player && !entry.hidden) entry.player = view.player
    entry.snapshot = snapshotOf(view, entry.snapshot)
    await this.persist()
  }

  private async load(): Promise<SavedPlayer[]> {
    if (this.entries) return this.entries
    let loaded: SavedPlayer[] = []
    if (this.filePath) {
      try {
        const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
        if (Array.isArray(parsed)) loaded = parsed as SavedPlayer[]
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[saved] could not read saved players:', err)
      }
    }
    // Another call may have loaded while this one was reading.
    this.entries ??= loaded
    return this.entries
  }

  /** Writes are queued so two quick changes never interleave; a temp file + rename avoids half-written files. */
  private persist(): Promise<void> {
    const file = this.filePath
    const data = JSON.stringify(this.entries ?? [], null, 2)
    this.writing = this.writing
      .then(async () => {
        if (!file) return
        await mkdir(dirname(file), { recursive: true })
        await writeFile(`${file}.tmp`, data)
        await rename(`${file}.tmp`, file)
      })
      .catch((err) => console.error('[saved] could not write saved players:', err))
      .finally(() => this.onChange())
    return this.writing
  }
}

/** When Riot didn't return the rank this time (rate limiting), the previous rank is kept. */
function snapshotOf(view: PlayerProfileView, prev: SavedSnapshot | null): SavedSnapshot {
  const keepRank = view.rankUnavailable && prev
  return {
    at: Date.now(),
    cardImage: view.cardImage ?? prev?.cardImage ?? null,
    accountLevel: view.accountLevel ?? prev?.accountLevel ?? null,
    rank: keepRank ? prev.rank : view.rank,
    rankedRating: keepRank ? prev.rankedRating : view.rankedRating,
    peakRank: keepRank ? prev.peakRank : (view.peakRank?.rank ?? null),
    stats: view.stats,
    mainAgent: view.topAgents[0]?.agent ?? null
  }
}
