import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Written by the Riot Client while it runs: `name:pid:port:password:protocol`. */
export interface Lockfile {
  name: string
  pid: number
  port: number
  password: string
  protocol: string
}

export function lockfilePath(): string {
  return join(process.env.LOCALAPPDATA ?? '', 'Riot Games', 'Riot Client', 'Config', 'lockfile')
}

/** Returns null when the Riot Client isn't running (the file only exists while it is). */
export async function readLockfile(): Promise<Lockfile | null> {
  let raw: string
  try {
    raw = await readFile(lockfilePath(), 'utf8')
  } catch {
    return null
  }
  const [name, pid, port, password, protocol] = raw.trim().split(':')
  if (!port || !password) return null
  return { name, pid: Number(pid), port: Number(port), password, protocol }
}

export function basicAuth(lockfile: Lockfile): string {
  return 'Basic ' + Buffer.from(`riot:${lockfile.password}`).toString('base64')
}
