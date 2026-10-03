import { useEffect, useState, type ReactNode } from 'react'
import type { RankInfo, TeamSlot } from '../../../shared/types'

export function PageHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {aside && <div className="page-header-aside">{aside}</div>}
    </header>
  )
}

export function RankBadge({ rank, rr, size = 'sm' }: { rank: RankInfo | null; rr?: number | null; size?: 'sm' | 'lg' }) {
  if (!rank) return null
  return (
    <span className={`rank rank-${size}`} style={{ '--rank-color': rank.color ?? 'var(--muted)' } as React.CSSProperties}>
      {rank.icon && <img src={rank.icon} alt="" />}
      <span className="rank-text">
        <span className="rank-name">{rank.name}</span>
        {rr != null && <span className="rank-rr">{rr} RR</span>}
      </span>
    </span>
  )
}

/** Ticks every second until `endsAt`. */
export function Countdown({ endsAt, format = 'seconds' }: { endsAt: number; format?: 'seconds' | 'duration' }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = Math.max(0, endsAt - now)
  if (format === 'seconds') return <>{Math.ceil(ms / 1000)}</>
  return <>{formatDuration(ms)}</>
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p className="error-note" role="alert">
      {message}
    </p>
  )
}

export function PlayerName({ slot, onOpen }: { slot: Pick<TeamSlot, 'displayName' | 'isSelf'>; onOpen?: () => void }) {
  if (slot.displayName === null) {
    const label = 'Hidden (streamer mode)'
    if (onOpen) {
      return (
        <button className="player-name player-link hidden-name" onClick={onOpen} title="View profile">
          {label}
        </button>
      )
    }
    return <span className="player-name hidden-name">{label}</span>
  }
  const [name, tag] = slot.displayName.split('#')
  const content = (
    <>
      {name}
      <span className="tag">#{tag}</span>
      {slot.isSelf && <span className="you">You</span>}
    </>
  )
  if (onOpen) {
    return (
      <button className="player-name player-link" onClick={onOpen} title="View profile">
        {content}
      </button>
    )
  }
  return <span className="player-name">{content}</span>
}

export function Loading() {
  return <div className="loading" aria-label="Loading" />
}

/** "just now", "5 min ago", "3 days ago"... */
export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.round((now - ts) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
