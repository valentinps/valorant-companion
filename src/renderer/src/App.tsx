import { useEffect, useRef, useState } from 'react'
import type { AppStatus, GamePhase } from '../../shared/types'
import { remote, StatusContext, useRemoteConnection, useStatusSubscription } from './api'
import { OverlayProvider } from './features/overlays/Overlays'
import { FEATURES as ALL_FEATURES } from './features/registry'

/** Pages that manage the PC itself (pairing) aren't offered on the phone. */
const FEATURES = remote ? ALL_FEATURES.filter((f) => !f.desktopOnly) : ALL_FEATURES

if (!remote) document.documentElement.classList.add('has-titlebar')

const PHASE_LABEL: Record<GamePhase, string> = {
  DISCONNECTED: 'Riot Client closed',
  GAME_CLOSED: 'Game closed',
  MENUS: 'In menus',
  PREGAME: 'Agent select',
  INGAME: 'In a match'
}

export function App() {
  const connection = useRemoteConnection()
  return (
    <div className="app-frame">
      {remote ? connection === 'offline' && <RemoteBanner /> : <TitleBar />}
      {connection === 'unpaired' ? <PairScreen /> : <AppContent />}
    </div>
  )
}

function AppContent() {
  const status = useStatusSubscription()
  if (!status) return <div className="boot" />
  if (status.phase === 'DISCONNECTED') return <ConnectScreen status={status} />
  return (
    <StatusContext.Provider value={status}>
      <Shell status={status} />
    </StatusContext.Provider>
  )
}

/** Drag area for the frameless window; Windows draws its own buttons on the right. */
function TitleBar() {
  return (
    <header className="titlebar">
      <span className="titlebar-mark" aria-hidden />
      <span className="titlebar-name">Valorant Companion</span>
    </header>
  )
}

/** Phone only: shown while the PC can't be reached. */
function RemoteBanner() {
  return (
    <div className="remote-banner" role="status">
      Reconnecting to your PC...
    </div>
  )
}

/** Phone only: opened without (or with an outdated) pairing link. */
function PairScreen() {
  return (
    <div className="connect">
      <div className="connect-card">
        <h1>Pair this phone</h1>
        <p>
          On your PC, open Valorant Companion, go to <strong>Phone</strong>, turn on remote access and scan the QR code
          with this phone's camera.
        </p>
      </div>
    </div>
  )
}

function Shell({ status }: { status: AppStatus }) {
  const [activeId, setActiveId] = useState(FEATURES[0].id)
  const lastPhase = useRef(status.phase)

  // Jump to the relevant page when the game changes phase (e.g. a match is found).
  useEffect(() => {
    if (status.phase === lastPhase.current) return
    lastPhase.current = status.phase
    const target = FEATURES.find((f) => f.focusOn === status.phase)
    if (target) setActiveId(target.id)
  }, [status.phase])

  const active = FEATURES.find((f) => f.id === activeId) ?? FEATURES[0]
  const Page = active.page

  return (
    <div className="shell">
      <nav className="rail" aria-label="Pages">
        <ul>
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <li key={f.id}>
                <button
                  className={`rail-item ${f.id === active.id ? 'is-active' : ''}`}
                  aria-current={f.id === active.id ? 'page' : undefined}
                  onClick={() => setActiveId(f.id)}
                >
                  <Icon />
                  <span>{f.label}</span>
                  {f.isActive?.(status) && <span className="live-dot" aria-label="happening now" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className={`rail-status phase-${status.phase.toLowerCase()}`}>
          <span className="phase">{PHASE_LABEL[status.phase]}</span>
          {status.player && (
            <span className="muted">
              {status.player.gameName}#{status.player.tagLine}
            </span>
          )}
        </div>
      </nav>
      <main className="content">
        <OverlayProvider>
          <Page key={active.id} />
        </OverlayProvider>
      </main>
    </div>
  )
}

function ConnectScreen({ status }: { status: AppStatus }) {
  return (
    <div className="connect">
      <div className="connect-card">
        <h1>Waiting for the Riot Client</h1>
        <p>
          Open the Riot Client and sign in. This app connects to it automatically, and your password is never needed.
        </p>
        {status.error && <p className="error-note">{status.error}</p>}
        <div className="loading" aria-hidden />
      </div>
    </div>
  )
}
