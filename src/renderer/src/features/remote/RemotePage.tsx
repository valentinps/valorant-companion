import { useState } from 'react'
import { useAction, useCommand } from '../../api'
import { ErrorNote, Loading, PageHeader, timeAgo } from '../../components/ui'
import type { RemoteLink, RemoteMode, RemoteView } from '../../../../shared/types'

const MODES: { id: RemoteMode; label: string }[] = [
  { id: 'internet', label: 'Anywhere' },
  { id: 'lan', label: 'Home network only' }
]

/** Pair a phone: it gets this same app in its browser. */
export function RemotePage() {
  const remote = useCommand('remote.get', [], { refreshOn: ['remote'] })
  const setEnabled = useAction('remote.setEnabled', remote.reload)
  const setMode = useAction('remote.setMode', remote.reload)
  const resetKey = useAction('remote.resetKey', remote.reload)
  const r = remote.data

  return (
    <div className="page">
      <PageHeader
        title="Phone remote"
        aside={
          r && (
            <label className="switch">
              <input
                type="checkbox"
                checked={r.enabled}
                disabled={setEnabled.pending}
                onChange={(e) => void setEnabled.run(e.target.checked)}
              />
              <span>Remote access</span>
            </label>
          )
        }
      />
      <ErrorNote message={remote.error ?? setEnabled.error ?? setMode.error ?? resetKey.error ?? r?.error} />
      {!r && remote.loading && <Loading />}

      {r && !r.enabled && (
        <section className="remote-intro">
          <p>
            Use this app from your phone: check the live match, browse profiles, manage your party or pick your agent
            from the couch. Your phone opens it in the browser, nothing to install.
          </p>
          <p className="muted">Only phones you pair by scanning a code on this screen get in.</p>
          <button className="secondary" onClick={() => void setEnabled.run(true)} disabled={setEnabled.pending}>
            Turn on remote access
          </button>
        </section>
      )}

      {r?.enabled && (
        <>
          <div className="remote-mode">
            <div className="segmented" role="tablist" aria-label="Connection">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={r.mode === m.id}
                  disabled={setMode.pending}
                  onClick={() => void setMode.run(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="muted">
              {r.mode === 'internet'
                ? 'Works on any Wi-Fi or mobile data, through a secure Cloudflare link.'
                : 'Phone and PC must be on the same network. Some routers, VPNs and firewalls block this.'}
            </span>
          </div>
          {r.links.length > 0 ? (
            <RemotePairing view={r} onReset={() => void resetKey.run()} resetting={resetKey.pending} />
          ) : (
            <RemotePending view={r} />
          )}
        </>
      )}
    </div>
  )
}

/** Before there's a link to show: downloading cloudflared, starting the tunnel, or no network. */
function RemotePending({ view: r }: { view: RemoteView }) {
  if (r.mode === 'lan') {
    return <p className="muted">{r.running ? "This PC isn't connected to a network, so no phone can reach it." : 'Starting...'}</p>
  }
  const t = r.tunnel
  if (t.state === 'error') return <ErrorNote message={t.error} />
  return (
    <div className="remote-pending">
      <div className="loading" aria-hidden />
      <p className="muted">
        {t.state === 'downloading'
          ? `Downloading Cloudflare's connector, one time only${t.progress != null ? ` (${t.progress}%)` : ''}...`
          : 'Opening a secure link, this takes a few seconds...'}
      </p>
    </div>
  )
}

function RemotePairing({ view: r, onReset, resetting }: { view: RemoteView; onReset: () => void; resetting: boolean }) {
  const [linkIndex, setLinkIndex] = useState(0)
  const [showUrl, setShowUrl] = useState(false)
  const index = Math.min(linkIndex, r.links.length - 1)
  const link: RemoteLink = r.links[index]
  const qr = `data:image/svg+xml;utf8,${encodeURIComponent(link.qrSvg)}`
  const clients = r.connectedClients
  const internet = r.mode === 'internet'

  return (
    <div className="remote-pair">
      <div className="remote-qr">
        <img src={qr} alt="QR code to open the app on your phone" />
        <span className="muted">{new URL(link.url).host}</span>
      </div>

      <div className="remote-steps">
        <ol>
          {!internet && <li>Connect your phone to the same Wi-Fi as this PC.</li>}
          <li>Scan the code with your phone's camera and open the link.</li>
          <li>
            Optional: use <strong>Add to Home Screen</strong> in your browser's menu to get an app icon.
          </li>
        </ol>
        {internet && (
          <p className="muted remote-note">
            The link changes each time the app starts, so scan again after restarting it.
          </p>
        )}

        {r.links.length > 1 && (
          <div className="remote-networks">
            <span className="muted">Not loading? Try another network of this PC:</span>
            <div className="segmented" role="tablist" aria-label="Network">
              {r.links.map((l, i) => (
                <button key={l.label + i} role="tab" aria-selected={i === index} onClick={() => setLinkIndex(i)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="remote-status">
          <span className={`remote-dot ${clients > 0 ? 'is-on' : ''}`} aria-hidden />
          {clients === 0 ? 'No phone connected' : clients === 1 ? '1 phone connected' : `${clients} phones connected`}
        </div>
        {clients === 0 && r.lastVisit && (
          <p className="muted remote-note">
            Last reached by {r.lastVisit.address}, {timeAgo(r.lastVisit.at)}.
          </p>
        )}

        <div className="remote-actions">
          <button className="small" onClick={() => setShowUrl((v) => !v)}>
            {showUrl ? 'Hide link' : 'Show link'}
          </button>
          <button className="small" onClick={onReset} disabled={resetting} title="Paired phones will need to scan again">
            Unpair all phones
          </button>
        </div>
        {showUrl && <code className="remote-url">{link.url}</code>}

        {!internet && (
          <p className="muted remote-help">
            Page hangs on the phone? Switch to <strong>Anywhere</strong> above: it doesn't depend on your network setup.
          </p>
        )}
      </div>
    </div>
  )
}
