import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Deployment {
  /** Used in GLZ hosts: glz-{region}-1.{shard}.a.pvp.net */
  region: string
  /** Used in PD/shared hosts: pd.{shard}.a.pvp.net */
  shard: string
}

// Riot Client region (from /riotclient/region-locale) -> VALORANT region + shard.
const REGION_MAP: Record<string, Deployment> = {
  NA: { region: 'na', shard: 'na' },
  PBE: { region: 'na', shard: 'pbe' },
  LATAM: { region: 'latam', shard: 'na' },
  LA1: { region: 'latam', shard: 'na' },
  LA2: { region: 'latam', shard: 'na' },
  BR: { region: 'br', shard: 'na' },
  EU: { region: 'eu', shard: 'eu' },
  EUW: { region: 'eu', shard: 'eu' },
  EUNE: { region: 'eu', shard: 'eu' },
  TR: { region: 'eu', shard: 'eu' },
  RU: { region: 'eu', shard: 'eu' },
  ME: { region: 'eu', shard: 'eu' },
  KR: { region: 'kr', shard: 'kr' },
  AP: { region: 'ap', shard: 'ap' },
  OC: { region: 'ap', shard: 'ap' },
  OC1: { region: 'ap', shard: 'ap' },
  JP: { region: 'ap', shard: 'ap' },
  SG: { region: 'ap', shard: 'ap' },
  PH: { region: 'ap', shard: 'ap' },
  TH: { region: 'ap', shard: 'ap' },
  TW: { region: 'ap', shard: 'ap' },
  VN: { region: 'ap', shard: 'ap' },
  SEA: { region: 'ap', shard: 'ap' }
}

export function deploymentFromRiotRegion(riotRegion: string): Deployment | null {
  return REGION_MAP[riotRegion.toUpperCase()] ?? null
}

export interface LogInfo {
  deployment: Deployment | null
  clientVersion: string | null
}

export function shooterGameLogPath(): string {
  return join(process.env.LOCALAPPDATA ?? '', 'VALORANT', 'Saved', 'Logs', 'ShooterGame.log')
}

/** The game log records both the GLZ host it talks to and the exact client version. */
export async function readShooterGameLog(): Promise<LogInfo> {
  let log: string
  try {
    log = await readFile(shooterGameLogPath(), 'utf8')
  } catch {
    return { deployment: null, clientVersion: null }
  }
  const glz = /https:\/\/glz-([a-z]+)-1\.([a-z]+)\.a\.pvp\.net/.exec(log)
  const version = /CI server version: (\S+)/.exec(log)
  return {
    deployment: glz ? { region: glz[1], shard: glz[2] } : null,
    clientVersion: version ? version[1] : null
  }
}
