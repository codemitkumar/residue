// Desktop app against the Vite dev server (hot reload). Ctrl+C stops both.
const { spawn } = require('node:child_process')
const PORT = 5175
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'inherit', shell: true })
setTimeout(() => {
  const el = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true, env: { ...process.env, RESIDUE_DEV_URL: `http://localhost:${PORT}` } })
  el.on('exit', () => vite.kill())
}, 2500)
