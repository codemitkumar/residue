// One life per machine. When a game ends, the ending is recorded against this computer's
// network hardware (a hash of its MAC addresses, never the addresses themselves) in three places:
//   1. the app's own data folder (with the full ending, for the ending screen),
//   2. %LOCALAPPDATA%\ResidueGame\lock.dat (left behind by the uninstaller),
//   3. the registry, HKCU\Software\ResidueGame.
// Any one of them is enough. Nothing is ever sent anywhere.
//
// This stops reinstalling, clearing app data or deleting the save. It cannot stop someone who
// changes their MAC address, edits the registry and deletes all three — that needs a server.
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const SECRET = 'residue/one-life/v1'
// Tests (plain Node, never the game itself) point these elsewhere so they never touch the real lock.
const TEST = !process.versions.electron
const REG_KEY = (TEST && process.env.RESIDUE_LOCK_REG) || 'HKCU\\Software\\ResidueGame'
const REG_VALUE = 'Lock'
// Adapters that come and go (VPNs, VMs, Bluetooth, Hyper-V) don't identify the machine.
const VIRTUAL = /virtual|vmware|vbox|hyper-v|vethernet|loopback|bluetooth|tap|tun|wsl|docker|zerotier|tailscale|npcap/i

const hash = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex').slice(0, 32)

/** Hashes of this machine's physical MAC addresses. */
function machineIds() {
  const ids = new Set()
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue
    for (const a of addrs ?? []) {
      if (a.internal || !a.mac || a.mac === '00:00:00:00:00:00') continue
      ids.add(hash(a.mac.toLowerCase()))
    }
  }
  // No network hardware at all: fall back to the machine's name and user, so the lock still holds.
  if (!ids.size) ids.add(hash(`host:${os.hostname()}:${os.userInfo().username}`))
  return [...ids].sort()
}

const sign = (rec) => crypto.createHmac('sha256', SECRET).update(JSON.stringify({ ...rec, sig: undefined })).digest('hex')

function valid(rec) {
  if (!rec || rec.v !== 1 || !Array.isArray(rec.machines) || typeof rec.sig !== 'string') return false
  if (sign(rec) !== rec.sig) return false
  const here = machineIds()
  return rec.machines.some((m) => here.includes(m))
}

function paths(app) {
  const local = (TEST && process.env.RESIDUE_LOCK_DIR) || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return {
    data: path.join(app.getPath('userData'), 'final.json'),
    marker: path.join(local, 'ResidueGame', 'lock.dat'),
  }
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readRegistry() {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync('reg', ['query', REG_KEY, '/v', REG_VALUE], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const b64 = out.match(/REG_SZ\s+(\S+)/)?.[1]
    return b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : null
  } catch {
    return null
  }
}

function writeRegistry(rec) {
  if (process.platform !== 'win32') return
  try {
    const b64 = Buffer.from(JSON.stringify(rec), 'utf8').toString('base64')
    execFileSync('reg', ['add', REG_KEY, '/v', REG_VALUE, '/t', 'REG_SZ', '/d', b64, '/f'], { windowsHide: true })
  } catch {
    /* the other two copies still hold */
  }
}

/** Is this machine's one life used up? Returns the lock and, if still on disk, the full ending. */
function readLock(app) {
  const p = paths(app)
  const data = readJson(p.data)
  const candidates = [data?.lock, readJson(p.marker), readRegistry()]
  const lock = candidates.find(valid)
  if (!lock) return { locked: false }
  // Heal: if any copy was deleted, put it back.
  writeLock(app, lock, data?.ending)
  return { locked: true, reason: lock.reason, kind: lock.kind, at: lock.at, endedOn: lock.endedOn, ending: data?.ending ?? null }
}

function writeLock(app, lock, ending) {
  const p = paths(app)
  for (const dir of [path.dirname(p.data), path.dirname(p.marker)]) fs.mkdirSync(dir, { recursive: true })
  if (ending) fs.writeFileSync(p.data, JSON.stringify({ lock, ending }))
  else if (!fs.existsSync(p.data)) fs.writeFileSync(p.data, JSON.stringify({ lock, ending: null }))
  fs.writeFileSync(p.marker, JSON.stringify(lock))
  writeRegistry(lock)
}

/** The game ended: record it against this machine for good. `ending` is the final world as JSON. */
function lockMachine(app, ending) {
  const existing = readLock(app)
  if (existing.locked) return existing
  let summary = {}
  try {
    const w = JSON.parse(ending)
    summary = { reason: String(w.gameOver?.reason ?? ''), kind: w.gameOver?.kind ?? 'arrested', at: w.gameOver?.at ?? 0 }
  } catch {
    /* keep the lock even if the ending is unreadable */
  }
  const rec = { v: 1, machines: machineIds(), endedOn: new Date().toISOString(), ...summary }
  rec.sig = sign(rec)
  writeLock(app, rec, ending)
  return { locked: true, ...summary }
}

/** Developer tool only (scripts/unlock-machine.cjs): remove every copy of the lock. */
function clearLock(app) {
  const p = paths(app)
  for (const f of [p.data, p.marker]) fs.rmSync(f, { force: true })
  if (process.platform === 'win32') {
    try {
      execFileSync('reg', ['delete', REG_KEY, '/f'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      /* not there */
    }
  }
}

module.exports = { readLock, lockMachine, clearLock, machineIds }
