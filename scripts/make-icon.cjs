// Renders build/icon.svg to build/icon.png (512) and build/icon.ico (256, PNG-in-ICO) using Electron itself.
// Run with: npx electron scripts/make-icon.cjs
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const dir = path.join(__dirname, '..', 'build')
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8')

async function render(win, size) {
  const html = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
  win.setContentSize(size, size)
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).resize({ width: size, height: size }).toPNG()
}

/** An .ico with one 256×256 PNG image (supported since Windows Vista). */
function ico(png) {
  const header = Buffer.alloc(6 + 16)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // icon
  header.writeUInt16LE(1, 4) // one image
  header.writeUInt8(0, 6) // width 256
  header.writeUInt8(0, 7) // height 256
  header.writeUInt8(0, 8) // no palette
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10) // planes
  header.writeUInt16LE(32, 12) // bpp
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18) // offset
  return Buffer.concat([header, png])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  fs.writeFileSync(path.join(dir, 'icon.png'), await render(win, 512))
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico(await render(win, 256)))
  console.log('wrote build/icon.png and build/icon.ico')
  app.quit()
})
