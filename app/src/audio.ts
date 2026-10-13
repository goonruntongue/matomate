// Tiny synthesized sound set (no assets).
//
// Unlocking: browsers only let audio start inside a user gesture, and iOS (Safari / home-screen app)
// only inside a tap's touchend or click — not on pointerdown / touchstart. The first sound of a game
// is usually the pick-up on pointerdown, so a context created there stayed suspended and the app was
// silent until some later tap. So every gesture (including touchend / click) tries to unlock the
// context until it runs, and again whenever the app comes back to the foreground (iOS can leave it
// suspended or "interrupted" after a switch).
import { useGame } from './state/store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    ctx.onstatechange = () => (ctx?.state === 'running' ? disarm() : arm());
  }
  return ctx;
}

const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
let armed = false;

function unlock() {
  const c = context();
  if (!c) return;
  if (c.state === 'running') {
    disarm();
    return;
  }
  void c.resume().catch(() => undefined);
  // Starting a (silent) source inside the gesture is what actually unlocks iOS.
  const blip = c.createBufferSource();
  blip.buffer = c.createBuffer(1, 1, c.sampleRate);
  blip.connect(c.destination);
  blip.start(0);
}

function arm() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });
}
function disarm() {
  if (!armed) return;
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, unlock, { capture: true });
}

if (typeof document !== 'undefined') {
  arm();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !ctx || ctx.state === 'running') return;
    void ctx.resume().catch(() => undefined);
    arm();
  });
}

/** For checks from the console / debug panel. */
export const audioState = () => ctx?.state ?? 'none';

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (useGame.getState().muted) return null;
  const c = context();
  if (!c) return null;
  if (c.state !== 'running') void c.resume().catch(() => undefined); // suspended or iOS "interrupted"
  return master ? { ctx: c, out: master } : null;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const pick = () => tone(740, 0.06, 'sine', 0.08, 0, 520);
export const tick = () => tone(1250, 0.04, 'triangle', 0.05);
export const drop = () => tone(430, 0.09, 'sine', 0.07, 0, 300);
export const miss = () => tone(170, 0.18, 'sine', 0.12, 0, 80);

export function whoosh(speed: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime;
  const dur = 0.3;
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx);
  const band = a.ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(500, t0);
  band.frequency.exponentialRampToValueAtTime(2600, t0 + dur);
  const env = a.ctx.createGain();
  const peak = Math.min(0.22, 0.06 + speed / 12000);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.06);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(band).connect(env).connect(a.out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** One knock: a filtered noise click (the contact) plus a short falling thump (the box body). */
function knock(a: { ctx: AudioContext; out: GainNode }, delay: number, level: number) {
  const t0 = a.ctx.currentTime + delay;
  const vary = 0.88 + Math.random() * 0.24; // no two drops sound identical

  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx);
  const band = a.ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1500 * vary;
  band.Q.value = 2.2;
  const click = a.ctx.createGain();
  click.gain.setValueAtTime(0.0001, t0);
  click.gain.exponentialRampToValueAtTime(0.4 * level, t0 + 0.002);
  click.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  src.connect(band).connect(click).connect(a.out);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + 0.06);

  const body = a.ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(210 * vary, t0);
  body.frequency.exponentialRampToValueAtTime(115 * vary, t0 + 0.07);
  const thump = a.ctx.createGain();
  thump.gain.setValueAtTime(0.0001, t0);
  thump.gain.exponentialRampToValueAtTime(0.3 * level, t0 + 0.003);
  thump.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  body.connect(thump).connect(a.out);
  body.start(t0);
  body.stop(t0 + 0.1);
}

/** Answer check: one bright ping per star earned (a soft low tone for zero). */
export function stars(count: number) {
  if (count <= 0) {
    tone(330, 0.3, 'sine', 0.06);
    return;
  }
  const notes = [659.25, 783.99, 1046.5];
  for (let i = 0; i < count; i++) tone(notes[i], 0.35, 'triangle', 0.08, 0.18 + i * 0.16);
}

/** Level up: a short rising arpeggio. */
export function fanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.22, 'triangle', 0.09, i * 0.11));
}

/** Party popper: a sharp noise crack plus a short paper rustle. */
export function popper(delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx);
  const hp = a.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.5, t0 + 0.004);
  env.gain.exponentialRampToValueAtTime(0.06, t0 + 0.06);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  src.connect(hp).connect(env).connect(a.out);
  src.start(t0, Math.random() * 0.2);
  src.stop(t0 + 0.5);

  // The "boom" body of the pop.
  const boom = a.ctx.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(140, t0);
  boom.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
  const benv = a.ctx.createGain();
  benv.gain.setValueAtTime(0.0001, t0);
  benv.gain.exponentialRampToValueAtTime(0.45, t0 + 0.004);
  benv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  boom.connect(benv).connect(a.out);
  boom.start(t0);
  boom.stop(t0 + 0.25);
}

/** One whistle glide ("ヒュー"): rises, wobbles, falls back a little. */
function whistle(a: { ctx: AudioContext; out: GainNode }, t0: number, f0: number, dur: number, level: number) {
  const osc = a.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.linearRampToValueAtTime(f0 * 1.45, t0 + dur * 0.6);
  osc.frequency.linearRampToValueAtTime(f0 * 1.25, t0 + dur);
  const vib = a.ctx.createOscillator();
  vib.frequency.value = 7 + Math.random() * 3;
  const vibAmt = a.ctx.createGain();
  vibAmt.gain.value = f0 * 0.02;
  vib.connect(vibAmt).connect(osc.frequency);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(level, t0 + 0.05);
  env.gain.setValueAtTime(level, t0 + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(a.out);
  osc.start(t0);
  vib.start(t0);
  osc.stop(t0 + dur + 0.02);
  vib.stop(t0 + dur + 0.02);
}

/** Cheers: a few people whistling "ヒューヒュー" over a soft crowd swell. */
export function cheer(delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  for (let p = 0; p < 3; p++) {
    const f0 = 1500 + Math.random() * 600;
    const start = t0 + p * 0.22 + Math.random() * 0.1;
    whistle(a, start, f0, 0.32, 0.035);
    whistle(a, start + 0.42, f0 * 1.03, 0.4, 0.035);
  }
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx);
  src.loop = true;
  const band = a.ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700;
  band.Q.value = 0.6;
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.05, t0 + 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
  src.connect(band).connect(env).connect(a.out);
  src.start(t0);
  src.stop(t0 + 2.7);
}

/** Applause "パチパチ": many short hand-clap bursts, dense at first and thinning out. */
export function applause(delay = 0, dur = 3.6) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  const buf = noiseBuffer(a.ctx);
  let t = 0;
  while (t < dur) {
    const fade = 1 - t / dur;
    const at = t0 + t;
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const band = a.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900 + Math.random() * 1800;
    band.Q.value = 1.4;
    const env = a.ctx.createGain();
    const peak = (0.05 + Math.random() * 0.09) * (0.25 + 0.75 * fade);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.02);
    src.connect(band).connect(env).connect(a.out);
    src.start(at, Math.random() * 0.4);
    src.stop(at + 0.06);
    t += (0.012 + Math.random() * 0.03) / (0.35 + 0.65 * fade);
  }
}

/** Typewriter: a quiet, low key strike. */
export const typeKey = () => tone(520 + Math.random() * 40, 0.05, 'sine', 0.03, 0, 380);

/** Clear: a bright rising run and a held major chord. */
export function grandFanfare(delay = 0) {
  const run = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  run.forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, delay + i * 0.09));
  const at = delay + run.length * 0.09 + 0.05;
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, 1.6, 'triangle', 0.06, at));
  tone(2093, 1.2, 'sine', 0.025, at + 0.05);
}

/** "Koto": a block set down inside the tray, with a small settle bounce. No musical pitch. */
export function clack() {
  const a = audio();
  if (!a) return;
  knock(a, 0, 1);
  knock(a, 0.055 + Math.random() * 0.02, 0.28);
}

/** Round clear: a quick shimmer of high bell-like tinkles. */
export function sparkle() {
  const notes = [1567.98, 2093, 2349.32, 2637.02, 3135.96, 2793.83];
  notes.forEach((f, i) => tone(f * (0.98 + Math.random() * 0.04), 0.25, 'triangle', 0.035, 0.05 + i * 0.055));
}
