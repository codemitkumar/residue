// Desktop shell: one window running the built game, plus the one-life machine lock.
const path = require('node:path')
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const { readLock, lockMachine, clearLock } = require('./lock.cjs')

// Developer tool: `Residue.exe --unlock-machine` wipes the lock (only in unpackaged runs).
if (!app.isPackaged && process.argv.includes('--unlock-machine')) {
  app.whenReady().then(() => {
    clearLock(app)
    console.log('Machine lock cleared.')
    app.quit()
  })
} else {
  if (!app.requestSingleInstanceLock()) app.quit()

  ipcMain.on('lock:read', (e) => {
    e.returnValue = readLock(app)
  })
  ipcMain.on('lock:write', (e, ending) => {
    e.returnValue = lockMachine(app, String(ending))
  })

  let win
  const create = () => {
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1000,
      minHeight: 680,
      backgroundColor: '#0a0b0d',
      title: 'Residue',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false, // the city keeps living while the window is in the background
      },
    })
    if (app.isPackaged) Menu.setApplicationMenu(null)
    win.once('ready-to-show', () => win.show())
    // Links open in the real browser, never inside the game.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file:') && !url.startsWith('http://localhost')) e.preventDefault()
    })
    const dev = process.env.RESIDUE_DEV_URL
    if (dev && !app.isPackaged) void win.loadURL(dev)
    else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(create)
  app.on('window-all-closed', () => app.quit())
}
