// The one-life machine lock, tested against a throwaway registry key and folder (never the real lock).
// node scripts/lock-check.cjs
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-lock-'))
process.env.RESIDUE_LOCK_DIR = path.join(tmp, 'local')
process.env.RESIDUE_LOCK_REG = 'HKCU\\Software\\ResidueGameLockTest'
const { readLock, lockMachine, clearLock, machineIds } = require('../electron/lock.cjs')
const app = { getPath: () => path.join(tmp, 'userData') }
const files = { data: path.join(tmp, 'userData', 'final.json'), marker: path.join(tmp, 'local', 'ResidueGame', 'lock.dat') }
const ok = (label, cond) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`) || (cond || (process.exitCode = 1))

try {
  console.log(`machine ids: ${machineIds().length} (hashed)`)
  ok('fresh machine is not locked', !readLock(app).locked)
  const ending = JSON.stringify({ gameOver: { at: 5000, kind: 'convicted', reason: 'Found guilty.' }, people: [] })
  lockMachine(app, ending)
  let l = readLock(app)
  ok('locked after a game over', l.locked && l.reason === 'Found guilty.' && l.ending === ending)

  fs.rmSync(files.data)
  l = readLock(app)
  ok('still locked with the app data (save + ending) deleted', l.locked)
  ok('...and the app data copy was put back', fs.existsSync(files.data))

  fs.rmSync(files.data)
  fs.rmSync(files.marker)
  ok('still locked with only the registry copy left', readLock(app).locked)

  execFileSync('reg', ['delete', process.env.RESIDUE_LOCK_REG, '/f'], { stdio: 'ignore' })
  ok('still locked with only the file copies left (healed above)', readLock(app).locked)

  // A lock copied from another machine (different MAC hashes) doesn't count.
  const foreign = JSON.parse(fs.readFileSync(files.marker, 'utf8'))
  foreign.machines = ['0'.repeat(32)]
  clearLock(app)
  fs.mkdirSync(path.dirname(files.marker), { recursive: true })
  fs.writeFileSync(files.marker, JSON.stringify(foreign))
  ok("another machine's lock (or a tampered one) doesn't lock this one", !readLock(app).locked)

  clearLock(app)
  ok('developer unlock clears everything', !readLock(app).locked)
} finally {
  clearLock(app)
  fs.rmSync(tmp, { recursive: true, force: true })
}
