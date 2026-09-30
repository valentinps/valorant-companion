import type { HttpMethod } from './http'

/**
 * Which Riot host an endpoint lives on.
 *  - local:  the Riot Client on this PC  (https://127.0.0.1:{port})
 *  - pd:     player data                 (https://pd.{shard}.a.pvp.net)
 *  - glz:    live game / party / pregame (https://glz-{region}-1.{shard}.a.pvp.net)
 *  - shared: content and config          (https://shared.{shard}.a.pvp.net)
 */
export type Host = 'local' | 'pd' | 'glz' | 'shared'

/**
 * A declarative description of one API endpoint.
 * `P` is the parameters object, `R` the (raw) response type.
 */
export interface Endpoint<P, R> {
  host: Host
  method: HttpMethod
  path: (params: P) => string
  body?: (params: P) => unknown
  /** Type-only marker so the response type travels with the definition. */
  readonly __response?: R
}

/**
 * Define an endpoint. Example:
 *
 *   export const getParty = endpoint<{ partyId: string }, PartyResponse>({
 *     host: 'glz',
 *     method: 'GET',
 *     path: (p) => `/parties/v1/parties/${p.partyId}`
 *   })
 */
export function endpoint<P = void, R = unknown>(def: Omit<Endpoint<P, R>, '__response'>): Endpoint<P, R> {
  return def
}

/** Endpoints without params are called as `api.call(ep)`, others as `api.call(ep, params)`. */
export type ParamsArg<P> = [P] extends [void] ? [] : [params: P]
