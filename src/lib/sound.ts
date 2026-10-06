import type { AmbientId } from './cosmetics'
import { useGameSettingsStore } from '../stores/gameSettingsStore'
import { useCosmeticsStore } from '../stores/cosmeticsStore'

/**
 * Writing sounds synthesized with Web Audio — no audio files. Everything is a
 * no-op where Web Audio is missing (tests, old browsers).
 */

type AudioContextCtor = typeof AudioContext

let ctx: AudioContext | null = null
let gestureHooked = false

function audioContext(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

/** Browsers start audio suspended until the user interacts; resume on the first gesture. */
function resumeOnGesture(context: AudioContext): void {
  if (context.state !== 'suspended' || gestureHooked) return
  gestureHooked = true
  const resume = () => {
    void context.resume().finally(() => {
      gestureHooked = false
    })
    window.removeEventListener('pointerdown', resume, true)
    window.removeEventListener('keydown', resume, true)
  }
  window.addEventListener('pointerdown', resume, true)
  window.addEventListener('keydown', resume, true)
}

// ---------------------------------------------------------------------------
// Settings gates
// ---------------------------------------------------------------------------

/** Key sounds are on: toggled on, Typewriter Keys owned, volume above 0. */
export function keySoundsOn(): boolean {
  const { sound } = useGameSettingsStore.getState()
  return sound.keySounds && sound.volume > 0 && useCosmeticsStore.getState().isOwned('sound-typewriter')
}

/** The soundscape that should be playing, if any. Quiet mode doesn't mute it. */
export function activeAmbient(): AmbientId | null {
  const { sound } = useGameSettingsStore.getState()
  if (sound.ambient === null || sound.volume <= 0) return null
  return useCosmeticsStore.getState().isOwned(`sound-${sound.ambient}`) ? sound.ambient : null
}

// ---------------------------------------------------------------------------
// Noise buffers
// ---------------------------------------------------------------------------

const noiseCache = new Map<string, AudioBuffer>()

function noiseBuffer(context: AudioContext, color: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
  const key = `${color}:${seconds}`
  const cached = noiseCache.get(key)
  if (cached) return cached
  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    if (color === 'white') {
      data[i] = white
    } else if (color === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11
    } else {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
  }
  noiseCache.set(key, buffer)
  return buffer
}

// ---------------------------------------------------------------------------
// Key clicks
// ---------------------------------------------------------------------------

let lastClickAt = 0

/** A short typewriter-ish click. Returns false when nothing played. */
export function playKeyClick(volume: number): boolean {
  const context = audioContext()
  if (!context || volume <= 0) return false
  resumeOnGesture(context)
  if (context.state !== 'running') return false
  const now = context.currentTime
  // Throttle: fast typing shouldn't stack into a buzz.
  if (now - lastClickAt < 0.035) return false
  lastClickAt = now

  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, 'white', 0.25)
  const band = context.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2200 + Math.random() * 1400
  band.Q.value = 3
  const gain = context.createGain()
  const peak = 0.35 * volume
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)

  // A low "thock" under the click.
  const thump = context.createOscillator()
  thump.type = 'triangle'
  thump.frequency.setValueAtTime(180 + Math.random() * 40, now)
  thump.frequency.exponentialRampToValueAtTime(70, now + 0.05)
  const thumpGain = context.createGain()
  thumpGain.gain.setValueAtTime(0.0001, now)
  thumpGain.gain.exponentialRampToValueAtTime(0.25 * volume, now + 0.003)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)

  src.connect(band).connect(gain).connect(context.destination)
  thump.connect(thumpGain).connect(context.destination)
  src.start(now, Math.random() * 0.2, 0.05)
  thump.start(now)
  thump.stop(now + 0.07)
  return true
}

// ---------------------------------------------------------------------------
// Soundscapes
// ---------------------------------------------------------------------------

interface AmbientVoice {
  sound: AmbientId
  master: GainNode
  stop: () => void
}

let ambient: AmbientVoice | null = null

function loopNoise(context: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, color, 4)
  src.loop = true
  return src
}

function filter(context: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = context.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = q
  return f
}

/** Slow random wobble on an AudioParam (gusts, murmurs). */
function wobble(context: AudioContext, param: AudioParam, rate: number, depth: number): OscillatorNode {
  const lfo = context.createOscillator()
  lfo.frequency.value = rate
  const amount = context.createGain()
  amount.gain.value = depth
  lfo.connect(amount).connect(param)
  return lfo
}

function buildAmbient(context: AudioContext, sound: AmbientId, out: GainNode): () => void {
  const sources: AudioScheduledSourceNode[] = []
  const timers: number[] = []

  if (sound === 'rain') {
    // Steady rainfall: pink noise, band-limited, with slow gusts.
    const rain = loopNoise(context, 'pink')
    const hp = filter(context, 'highpass', 400)
    const lp = filter(context, 'lowpass', 6000)
    const g = context.createGain()
    g.gain.value = 0.55
    sources.push(wobble(context, g.gain, 0.07, 0.12))
    rain.connect(hp).connect(lp).connect(g).connect(out)
    const rumble = loopNoise(context, 'brown')
    const rg = context.createGain()
    rg.gain.value = 0.25
    rumble.connect(filter(context, 'lowpass', 300)).connect(rg).connect(out)
    sources.push(rain, rumble)
  } else if (sound === 'fire') {
    // Low roar plus random crackles.
    const roar = loopNoise(context, 'brown')
    const g = context.createGain()
    g.gain.value = 0.6
    sources.push(wobble(context, g.gain, 0.3, 0.15))
    roar.connect(filter(context, 'lowpass', 500)).connect(g).connect(out)
    sources.push(roar)
    const crackle = () => {
      const t = context.currentTime
      const pop = context.createBufferSource()
      pop.buffer = noiseBuffer(context, 'white', 0.25)
      const pg = context.createGain()
      const level = 0.15 + Math.random() * 0.35
      pg.gain.setValueAtTime(level, t)
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.04)
      pop.connect(filter(context, 'bandpass', 1500 + Math.random() * 3000, 1.5)).connect(pg).connect(out)
      pop.start(t, Math.random() * 0.2, 0.08)
      timers.push(window.setTimeout(crackle, 80 + Math.random() * 600))
    }
    crackle()
  } else {
    // Tavern: a warm room tone and an indistinct murmur of voices.
    const room = loopNoise(context, 'brown')
    const rg = context.createGain()
    rg.gain.value = 0.35
    room.connect(filter(context, 'lowpass', 400)).connect(rg).connect(out)
    sources.push(room)
    for (const [freq, rate] of [[420, 3.1], [650, 4.3], [900, 2.6]] as const) {
      const voices = loopNoise(context, 'pink')
      const vg = context.createGain()
      vg.gain.value = 0.12
      sources.push(wobble(context, vg.gain, rate, 0.1))
      voices.connect(filter(context, 'bandpass', freq, 2.5)).connect(vg).connect(out)
      sources.push(voices)
    }
    const hum = context.createOscillator()
    hum.type = 'sine'
    hum.frequency.value = 110
    const hg = context.createGain()
    hg.gain.value = 0.03
    hum.connect(hg).connect(out)
    sources.push(hum)
  }

  for (const s of sources) s.start()
  return () => {
    for (const id of timers.splice(0)) window.clearTimeout(id)
    for (const s of sources) {
      try {
        s.stop()
      } catch {
        // already stopped
      }
    }
  }
}

/** Start (or switch to) a soundscape. Fades in. */
export function startAmbient(sound: AmbientId, volume: number): void {
  const context = audioContext()
  if (!context) return
  resumeOnGesture(context)
  if (ambient?.sound === sound) {
    setAmbientVolume(volume)
    return
  }
  stopAmbient()
  const master = context.createGain()
  master.gain.setValueAtTime(0.0001, context.currentTime)
  master.gain.linearRampToValueAtTime(0.5 * volume, context.currentTime + 1.5)
  master.connect(context.destination)
  const stop = buildAmbient(context, sound, master)
  ambient = { sound, master, stop }
}

export function setAmbientVolume(volume: number): void {
  if (!ambient || !ctx) return
  ambient.master.gain.setTargetAtTime(0.5 * volume, ctx.currentTime, 0.1)
}

/** Fade out and stop the soundscape. */
export function stopAmbient(): void {
  if (!ambient || !ctx) {
    ambient = null
    return
  }
  const { master, stop } = ambient
  ambient = null
  master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2)
  window.setTimeout(() => {
    stop()
    master.disconnect()
  }, 900)
}

/** Keep the soundscape in step with settings and ownership. Returns an unsubscribe. */
export function syncAmbient(): () => void {
  let playing: AmbientId | null = null
  let volume = -1
  const apply = () => {
    const want = activeAmbient()
    const vol = useGameSettingsStore.getState().sound.volume
    if (want !== playing) {
      if (want === null) stopAmbient()
      else startAmbient(want, vol)
      playing = want
      volume = vol
    } else if (want !== null && vol !== volume) {
      setAmbientVolume(vol)
      volume = vol
    }
  }
  apply()
  const offSettings = useGameSettingsStore.subscribe(apply)
  const offCosmetics = useCosmeticsStore.subscribe(apply)
  return () => {
    offSettings()
    offCosmetics()
    stopAmbient()
  }
}
