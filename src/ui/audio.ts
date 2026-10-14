// Procedural sound: every effect is synthesized with Web Audio, so the game ships no audio files
// and has no licensing to worry about. Swap in recorded assets later by replacing these functions.

type Mood = 'day' | 'night'

class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfx: GainNode | null = null
  private amb: GainNode | null = null
  private ambNodes: { filter: BiquadFilterNode; drone: OscillatorNode } | null = null
  private sirenTimer: number | null = null
  private noiseBuf: AudioBuffer | null = null
  muted = false
  volume = 0.7
  mood: Mood = 'day'

  constructor() {
    try {
      this.muted = localStorage.getItem('residue.muted') === '1'
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume
    this.master.connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.connect(this.master)
    this.amb = ctx.createGain()
    this.amb.gain.value = 0
    this.amb.connect(this.master)
    // Two seconds of brown noise, reused everywhere.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = last * 3.5
    }
    this.noiseBuf = buf
    this.startAmbience()
  }

  setMuted(m: boolean) {
    this.muted = m
    try {
      localStorage.setItem('residue.muted', m ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1)
  }

  private noise(dest: AudioNode, at: number, dur: number) {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.connect(dest)
    src.start(at, Math.random())
    src.stop(at + dur)
    return src
  }

  private tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = opts.type ?? 'sine'
    o.frequency.setValueAtTime(freq, at)
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur)
    const peak = opts.gain ?? 0.2
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.01))
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g).connect(this.sfx!)
    o.start(at)
    o.stop(at + dur + 0.05)
  }

  private ready() {
    return !!this.ctx && !this.muted
  }

  // ------------------------------------------------------------ ambience

  private startAmbience() {
    const ctx = this.ctx!
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    const ng = ctx.createGain()
    ng.gain.value = 0.18
    this.noise(filter, ctx.currentTime, 1e6)
    filter.connect(ng).connect(this.amb!)
    // A low, slowly breathing drone.
    const drone = ctx.createOscillator()
    drone.type = 'sawtooth'
    drone.frequency.value = 55
    const dl = ctx.createBiquadFilter()
    dl.type = 'lowpass'
    dl.frequency.value = 140
    const dg = ctx.createGain()
    dg.gain.value = 0.05
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lg = ctx.createGain()
    lg.gain.value = 0.03
    lfo.connect(lg).connect(dg.gain)
    drone.connect(dl).connect(dg).connect(this.amb!)
    drone.start()
    lfo.start()
    this.ambNodes = { filter, drone }
    this.amb!.gain.setTargetAtTime(0.6, ctx.currentTime, 2)
    this.applyMood()
  }

  private rain: GainNode | null = null
  private thunderTimer: number | null = null
  private wx = ''

  /** Rain hiss, and the odd roll of thunder in a storm. */
  setWeather(kind: string) {
    if (kind === this.wx || !this.ctx) return
    this.wx = kind
    if (!this.rain) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 900
      this.rain = this.ctx.createGain()
      this.rain.gain.value = 0
      this.noise(f, this.ctx.currentTime, 1e6)
      f.connect(this.rain).connect(this.amb!)
    }
    const level = kind === 'storm' ? 0.35 : kind === 'rain' ? 0.18 : 0
    this.rain.gain.setTargetAtTime(level, this.ctx.currentTime, 2)
    if (this.thunderTimer) clearInterval(this.thunderTimer)
    this.thunderTimer = kind === 'storm' ? window.setInterval(() => {
      if (!this.ready() || Math.random() > 0.35) return
      const t = this.ctx!.currentTime
      const lp = this.ctx!.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 180
      const g = this.ctx!.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5)
      lp.connect(g).connect(this.sfx!)
      this.noise(lp, t, 3.6)
    }, 7000) : null
  }

  private urge = 0
  private urgeTimer: number | null = null

  /** The need gets audible: the drone sours and a heartbeat creeps in. */
  setUrge(u: number) {
    const level = u < 0.55 ? 0 : u < 0.7 ? 1 : u < 0.85 ? 2 : 3
    if (level === this.urge) return
    this.urge = level
    if (this.ctx && this.ambNodes) {
      const t = this.ctx.currentTime
      this.ambNodes.drone.detune.setTargetAtTime(level * -35, t, 2)
      this.amb!.gain.setTargetAtTime(0.6 + level * 0.25, t, 2)
    }
    if (this.urgeTimer) clearInterval(this.urgeTimer)
    this.urgeTimer = level ? window.setInterval(() => {
      if (!this.ready()) return
      if (Math.random() < 0.3 + level * 0.2) this.heartbeat(level + 1)
      if (level >= 3 && Math.random() < 0.3) this.tone(1800 + Math.random() * 2000, this.ctx!.currentTime, 0.4, { type: 'sine', gain: 0.02 }) // tinnitus
    }, 5000 - level * 1000) : null
  }

  setMood(m: Mood) {
    if (m === this.mood) return
    this.mood = m
    this.applyMood()
  }

  private applyMood() {
    if (!this.ctx || !this.ambNodes) return
    const t = this.ctx.currentTime
    const night = this.mood === 'night'
    // Daytime: brighter traffic hum. Night: muffled, lower drone, the odd distant siren.
    this.ambNodes.filter.frequency.setTargetAtTime(night ? 220 : 650, t, 3)
    this.ambNodes.drone.frequency.setTargetAtTime(night ? 41 : 55, t, 3)
    if (this.sirenTimer) clearInterval(this.sirenTimer)
    this.sirenTimer = night ? window.setInterval(() => Math.random() < 0.25 && this.siren(), 9000) : null
  }

  /** Police siren, loud and close. */
  alarm() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    for (let i = 0; i < 4; i++) {
      this.tone(700, t + i * 1.2, 0.6, { type: 'sawtooth', to: 1100, gain: 0.09, attack: 0.05 })
      this.tone(1100, t + i * 1.2 + 0.6, 0.6, { type: 'sawtooth', to: 700, gain: 0.09, attack: 0.05 })
    }
  }

  private siren() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    for (let i = 0; i < 4; i++) this.tone(620, t + i * 0.9, 0.9, { to: 880, gain: 0.012, attack: 0.3 })
  }

  // ------------------------------------------------------------ effects

  click() {
    if (!this.ready()) return
    const ctx = this.ctx!
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 2500
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04)
    f.connect(g).connect(this.sfx!)
    this.noise(f, ctx.currentTime, 0.05)
    this.tone(1800, ctx.currentTime, 0.03, { type: 'square', gain: 0.02 })
  }

  /** Typewriter clack burst for reports. */
  typewriter(n = 6) {
    if (!this.ready()) return
    const ctx = this.ctx!
    for (let i = 0; i < n; i++) {
      const at = ctx.currentTime + i * (0.06 + Math.random() * 0.05)
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1800 + Math.random() * 1500
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.4, at)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
      f.connect(g).connect(this.sfx!)
      this.noise(f, at, 0.04)
    }
  }

  personal() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    this.tone(988, t, 0.18, { gain: 0.12 })
    this.tone(740, t + 0.12, 0.35, { gain: 0.1 })
  }

  news() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    ;[523, 440, 349].forEach((f, i) => this.tone(f, t + i * 0.16, 0.5, { type: 'triangle', gain: 0.1 }))
    this.typewriter(5)
  }

  scanner() {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1400
    f.Q.value = 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    g.gain.setValueAtTime(0.35, t + 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    f.connect(g).connect(this.sfx!)
    this.noise(f, t, 0.55)
    this.tone(1200, t + 0.5, 0.08, { type: 'square', gain: 0.04 })
  }

  /** Something bad: police at the door, a body found. */
  danger() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    this.tone(70, t, 1.2, { gain: 0.5, to: 40 })
    this.tone(233, t + 0.05, 1.8, { type: 'sawtooth', gain: 0.04, attack: 0.4 })
    this.tone(247, t + 0.05, 1.8, { type: 'sawtooth', gain: 0.04, attack: 0.4 })
  }

  heartbeat(beats = 3) {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    for (let i = 0; i < beats; i++) {
      this.tone(60, t + i * 0.85, 0.18, { gain: 0.6, to: 35 })
      this.tone(55, t + i * 0.85 + 0.22, 0.2, { gain: 0.45, to: 32 })
    }
  }

  /** Phone ring: two-tone trill, called repeatedly while ringing. */
  ring() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    for (let i = 0; i < 10; i++) {
      this.tone(i % 2 ? 1320 : 1100, t + i * 0.06, 0.06, { type: 'square', gain: 0.035, attack: 0.005 })
      this.tone(i % 2 ? 1320 : 1100, t + 0.9 + i * 0.06, 0.06, { type: 'square', gain: 0.035, attack: 0.005 })
    }
  }

  /** Incoming text. */
  text() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    this.tone(1568, t, 0.09, { gain: 0.1 })
    this.tone(2093, t + 0.09, 0.14, { gain: 0.08 })
  }

  caught() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    this.tone(110, t, 4, { type: 'sawtooth', gain: 0.12, to: 36, attack: 0.05 })
    this.tone(116, t, 4, { type: 'sawtooth', gain: 0.1, to: 38, attack: 0.05 })
    this.tone(55, t, 2, { gain: 0.6, to: 30 })
    if (this.ambNodes && this.ctx) this.amb!.gain.setTargetAtTime(0.1, this.ctx.currentTime, 1)
  }

  start() {
    if (!this.ready()) return
    const t = this.ctx!.currentTime
    this.tone(82, t, 2.5, { type: 'sawtooth', gain: 0.1, attack: 0.6 })
    this.tone(123, t + 0.3, 2.5, { type: 'triangle', gain: 0.08, attack: 0.6 })
    this.heartbeat(2)
  }
}

export const sound = new Sound()
