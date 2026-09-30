/**
 * Small in-memory cache with expiry, size cap and in-flight de-duplication:
 * concurrent `getOrLoad` calls for the same key share one request.
 * Expired entries are kept (up to the size cap) so callers can fall back to stale data on errors.
 */
export class TtlCache<K, V> {
  private entries = new Map<K, { value: V; storedAt: number }>()
  private inFlight = new Map<K, Promise<V>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize = 500
  ) {}

  get(key: K): V | undefined {
    const e = this.entries.get(key)
    return e && Date.now() - e.storedAt < this.ttlMs ? e.value : undefined
  }

  /** Returns the last stored value even if it has expired. */
  getStale(key: K): V | undefined {
    return this.entries.get(key)?.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key) // re-insert so Map order tracks recency
    this.entries.set(key, { value, storedAt: Date.now() })
    if (this.entries.size > this.maxSize) this.entries.delete(this.entries.keys().next().value!)
  }

  getOrLoad(key: K, load: () => Promise<V>): Promise<V> {
    const cached = this.get(key)
    if (cached !== undefined) return Promise.resolve(cached)
    const pending = this.inFlight.get(key)
    if (pending) return pending
    const promise = load()
      .then((value) => {
        this.set(key, value)
        return value
      })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, promise)
    return promise
  }

  /** Like getOrLoad, but on failure returns stale data if there is any. */
  async getOrLoadWithFallback(key: K, load: () => Promise<V>): Promise<V> {
    try {
      return await this.getOrLoad(key, load)
    } catch (err) {
      const stale = this.getStale(key)
      if (stale !== undefined) return stale
      throw err
    }
  }
}
