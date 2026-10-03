import { networkInterfaces } from 'node:os'

export interface LanAddress {
  address: string
  /** Adapter name, e.g. "Wi-Fi" or "Ethernet". */
  label: string
}

// Adapters a phone on the home network can't reach (VMs, WSL, Docker) go last.
const VIRTUAL = /vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|bluetooth/i
// VPN-style networks: reachable from a phone only if it's on the same VPN, so after the LAN.
const OVERLAY = /tailscale|zerotier|hamachi|wireguard|nordlynx|openvpn|tap-/i

/** IPv4 addresses of this PC, most likely to be reachable from a phone first. */
export function lanAddresses(): LanAddress[] {
  const found: (LanAddress & { score: number })[] = []
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue
      let score = isPrivate(a.address) ? 0 : 2
      if (OVERLAY.test(name)) score = 3
      if (VIRTUAL.test(name)) score = 4
      found.push({ address: a.address, label: name, score })
    }
  }
  return found.sort((a, b) => a.score - b.score).map(({ address, label }) => ({ address, label }))
}

function isPrivate(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}
