import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { createBackend } from './backend'
import { forwardEvents, registerIpc } from './ipc'

const backend = createBackend({
  cacheDir: join(app.getPath('userData'), 'cache'),
  savedPlayersFile: join(app.getPath('userData'), 'saved-players.json'),
  remoteSettingsFile: join(app.getPath('userData'), 'remote.json'),
  toolsDir: join(app.getPath('userData'), 'tools'),
  remoteUi: process.env.ELECTRON_RENDERER_URL
    ? { devUrl: process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '') }
    : { dir: join(__dirname, '../renderer') }
})

/** Must match .titlebar in the renderer's styles.css. */
const TITLE_BAR = { color: '#16222d', symbols: '#ece8e1', height: 36 }

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1923',
    title: 'Valorant Companion',
    autoHideMenuBar: true,
    // The UI draws its own title bar; Windows keeps its native buttons, recoloured to match.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLE_BAR.color, symbolColor: TITLE_BAR.symbols, height: TITLE_BAR.height },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  const stopForwarding = forwardEvents(backend, win.webContents)
  win.on('closed', stopForwarding)

  // Open external links in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// The UI only loads its own code and images from valorant-api.com. Skipped in dev,
// where Vite's hot reload needs inline scripts.
const CSP = "default-src 'self'; img-src 'self' https://media.valorant-api.com data:; style-src 'self' 'unsafe-inline'"

app.whenReady().then(() => {
  if (!process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
    })
  }
  registerIpc(backend)
  backend.tracker.start()
  void backend.services.remote.restore()
  void backend.ctx.assets.load().catch((err) => console.error('[static] failed to load game data:', err))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  backend.tracker.stop()
  void backend.services.remote.stop()
  app.quit()
})
