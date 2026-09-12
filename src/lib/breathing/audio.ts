/**
 * Sound for the breathing player, synthesised with Web Audio.
 *
 * No audio files: nothing to host, license or download, and it works offline.
 * Each cue is scheduled on the audio clock slightly ahead of time (the
 * player's lookahead), so it lands on the phase boundary exactly instead of
 * whenever the next animation frame happens to run.
 *
 * The scheduling functions take any BaseAudioContext, so they can be rendered
 * with an OfflineAudioContext and measured -- that is how they are verified,
 * since nobody here can listen.
 *
 * Real-device behaviour a desktop browser cannot prove:
 *  - iOS Safari makes no sound until the context is resumed inside a tap, so
 *    `unlockBreathAudio()` must run in the Start button's click handler.
 *  - iOS sends Web Audio through the ringer: with the silent switch on it is
 *    muted unless the page declares itself as playback. `navigator.audioSession`
 *    (Safari on iOS 17 and later) does that; older iOS has no way to.
 *  - Locking the phone suspends the context. The player pauses itself when the
 *    page is hidden, so nothing is scheduled into a context that is not running.
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type SessionNavigator = Navigator & { audioSession?: { type: string } };

let shared: AudioContext | null = null;
let master: GainNode | null = null;

/**
 * Development only: a record of every cue scheduled, readable from the console
 * as `__breathCues`, with the live context as `__breathCtx`. It is how a
 * browser session is checked against the timeline without anyone listening.
 * Next.js replaces NODE_ENV at build time, so none of this ships.
 */
export type CueRecord =
  | { kind: "glide"; at: number; duration: number; fromHz: number; toHz: number }
  | { kind: "swell"; at: number; duration: number; fromSize: number; toSize: number }
  | { kind: "hum"; at: number; duration: number; hz: number }
  | { kind: "bell"; at: number; hz: number }
  | { kind: "pump"; at: number; hz: number }
  | { kind: "ambience"; at: number; bed: string; volume: number }
  | { kind: "stop"; at: number };

function record(cue: CueRecord) {
  if (process.env.NODE_ENV !== "development") return;
  const g = globalThis as typeof globalThis & { __breathCues?: CueRecord[] };
  (g.__breathCues ??= []).push(cue);
}

function contextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as AudioWindow).webkitAudioContext ?? null;
}

export function audioSupported(): boolean {
  return contextConstructor() !== null;
}

/**
 * Create the shared context once and resume it. Must be called from inside a
 * user gesture. It survives client-side navigation, which is what lets the tap
 * on Start (on the setup screen) unlock sound for the session screen.
 */
export function unlockBreathAudio(): AudioContext | null {
  const Ctor = contextConstructor();
  if (!Ctor) return null;

  try {
    const nav = navigator as SessionNavigator;
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    // Only the silent-switch behaviour depends on this.
  }

  if (!shared) {
    try {
      shared = new Ctor();
      master = shared.createGain();
      master.gain.value = 0.9;
      master.connect(shared.destination);
      if (process.env.NODE_ENV === "development") {
        (globalThis as typeof globalThis & { __breathCtx?: AudioContext }).__breathCtx = shared;
      }
    } catch {
      shared = null;
      master = null;
      return null;
    }
  }
  if (shared.state !== "running") void shared.resume().catch(() => {});
  return shared;
}

export function breathAudio(): { ctx: AudioContext; out: AudioNode } | null {
  return shared && master ? { ctx: shared, out: master } : null;
}

/** Sound is only heard in "running". Anything else is worth telling the user about. */
export function breathAudioState(): AudioContextState | "none" {
  return shared?.state ?? "none";
}

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

/** Orb size to pitch: up a fifth from G3 to D4, so a breath in rises and a breath out falls. */
const LOW_HZ = 196;
const HIGH_HZ = 293.66;

export function sizeToHz(size: number): number {
  const s = Math.min(1, Math.max(0, size));
  return LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, s);
}

export type Voice = { stop: (when?: number) => void };

const SILENT = 0.0001;

/** Fade a gain to silence from `when`, holding its current value first so there is no click. */
function fadeOut(param: AudioParam, when: number, timeConstant = 0.04) {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === "function") {
    p.cancelAndHoldAtTime(when);
  } else {
    param.cancelScheduledValues(when);
    param.setValueAtTime(param.value, when);
  }
  param.setTargetAtTime(SILENT, when, timeConstant);
}

/**
 * A soft tone that follows the whole inhale or exhale, its pitch moving with
 * the orb. Three partials through a low-pass keep it round rather than
 * electronic; the long release means one breath hands over to the next
 * without a hard edge.
 */
export function scheduleGlide(
  ctx: BaseAudioContext,
  out: AudioNode,
  opts: { at: number; duration: number; fromSize: number; toSize: number; peak?: number },
): Voice {
  const { at, duration, fromSize, toSize, peak = 0.11 } = opts;
  const end = at + duration;
  const attack = Math.min(0.35, duration * 0.2);
  const release = Math.min(0.6, duration * 0.3);
  record({ kind: "glide", at, duration, fromHz: sizeToHz(fromSize), toHz: sizeToHz(toSize) });

  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, at);
  env.gain.exponentialRampToValueAtTime(peak, at + attack);
  env.gain.setValueAtTime(peak, Math.max(at + attack, end - release));
  env.gain.exponentialRampToValueAtTime(SILENT, end);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  env.connect(filter).connect(out);

  const partials: Array<{ type: OscillatorType; ratio: number; level: number }> = [
    { type: "sine", ratio: 1, level: 1 },
    { type: "sine", ratio: 2, level: 0.16 },
    { type: "triangle", ratio: 0.5, level: 0.22 },
  ];
  const oscs = partials.map(({ type, ratio, level }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(sizeToHz(fromSize) * ratio, at);
    osc.frequency.exponentialRampToValueAtTime(sizeToHz(toSize) * ratio, end);
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(at);
    osc.stop(end + 0.05);
    return osc;
  });

  return {
    stop(when = ctx.currentTime) {
      record({ kind: "stop", at: when });
      fadeOut(env.gain, when);
      for (const o of oscs) {
        try {
          o.stop(when + 0.25);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}

/**
 * A small struck bell: inharmonic partials with their own decays. Used at the
 * start of a hold (higher after an inhale, lower after an exhale), for the
 * settle-in count and at the end of a practice.
 */
export function scheduleBell(
  ctx: BaseAudioContext,
  out: AudioNode,
  opts: { at: number; hz: number; peak?: number; decay?: number },
): Voice {
  const { at, hz, peak = 0.07, decay = 1.6 } = opts;
  record({ kind: "bell", at, hz });
  const partials = [
    { ratio: 1, level: 1, decay: 1 },
    { ratio: 2.76, level: 0.3, decay: 0.55 },
    { ratio: 5.4, level: 0.1, decay: 0.3 },
  ];
  const gains: GainNode[] = [];
  const oscs = partials.map(({ ratio, level, decay: k }) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, at);
    g.gain.exponentialRampToValueAtTime(Math.max(SILENT * 2, peak * level), at + 0.008);
    g.gain.exponentialRampToValueAtTime(SILENT, at + decay * k);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + decay * k + 0.05);
    gains.push(g);
    return osc;
  });

  return {
    stop(when = ctx.currentTime) {
      for (const g of gains) fadeOut(g.gain, when, 0.02);
      for (const o of oscs) {
        try {
          o.stop(when + 0.15);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}

/** Bell pitches, an octave above the glide's range so they sit clear of it. */
export const BELL_HIGH = sizeToHz(1) * 2;
export const BELL_LOW = sizeToHz(0) * 2;

/**
 * A round of Kapalabhati: one short knock per pump, on the beat.
 *
 * A tone that rose and fell would be wrong here -- a pump is a single sharp
 * movement, not a shape you follow through. So each one is a brief, dry knock,
 * quiet enough to sit under the sound of your own breathing, and the whole
 * round is scheduled in one go on the audio clock so the tempo never drifts.
 */
export function schedulePumps(
  ctx: BaseAudioContext,
  out: AudioNode,
  opts: { at: number; count: number; rate: number },
): Voice {
  const { at, count, rate } = opts;
  record({ kind: "pump", at, hz: PUMP_HZ });

  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.connect(out);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = PUMP_HZ;
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, at);
  osc.connect(env).connect(gain);

  const step = 1 / rate;
  for (let i = 0; i < count; i++) {
    const t = at + i * step;
    // A knock, not a note: up in four milliseconds, gone in ninety.
    env.gain.setValueAtTime(SILENT, t);
    env.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
    env.gain.exponentialRampToValueAtTime(SILENT, t + 0.09);
  }
  const until = at + count * step;
  osc.start(at);
  osc.stop(until + 0.2);

  return {
    stop(when = ctx.currentTime) {
      fadeOut(gain.gain, when, 0.02);
      try {
        osc.stop(when + 0.15);
      } catch {
        // Already stopped.
      }
    },
  };
}

/** Low and dry, well under the glide, so a round of pumping does not shrill. */
const PUMP_HZ = 146.83;

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/**
 * Six seconds of pink noise, made once per context and looped.
 *
 * Pink rather than white: its energy falls with frequency, which is why it
 * passes for rain and sea where white noise sounds like a broken television.
 * The filter is Paul Kellet's, the usual cheap approximation.
 */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;

  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 6), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

function loopingNoise(ctx: BaseAudioContext, at: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  // A different starting point each time, so two layers never phase together.
  source.start(at, Math.random() * 3);
  return source;
}

/** Eased size at `p` (0..1) through a phase that runs `fromSize` → `toSize`. */
function sizeCurve(fromSize: number, toSize: number, points = 64): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const p = i / (points - 1);
    const eased = -(Math.cos(Math.PI * p) - 1) / 2;
    curve[i] = fromSize + (toSize - fromSize) * eased;
  }
  return curve;
}

// ---------------------------------------------------------------------------
// Ocean: the breath as a wave
// ---------------------------------------------------------------------------

/**
 * A wave that swells as you breathe in and ebbs as you breathe out.
 *
 * The same eased curve that moves the orb moves the noise: louder and brighter
 * as you fill, quieter and darker as you empty. A hold is a phase whose size
 * does not change, so the sea simply holds its level -- which is what tells you
 * to hold, with your eyes closed and no bell needed.
 */
export function scheduleSwell(
  ctx: BaseAudioContext,
  out: AudioNode,
  opts: { at: number; duration: number; fromSize: number; toSize: number; peak?: number },
): Voice {
  const { at, duration, fromSize, toSize, peak = 0.2 } = opts;
  record({ kind: "swell", at, duration, fromSize, toSize });

  const sizes = sizeCurve(fromSize, toSize);
  const gains = new Float32Array(sizes.length);
  const cutoffs = new Float32Array(sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    gains[i] = peak * (0.14 + 0.86 * sizes[i]);
    cutoffs[i] = 420 + 1300 * sizes[i];
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(gains[0], at);
  env.gain.setValueCurveAtTime(gains, at, duration);

  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.Q.value = 0.7;
  low.frequency.setValueAtTime(cutoffs[0], at);
  low.frequency.setValueCurveAtTime(cutoffs, at, duration);

  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 120;

  const source = loopingNoise(ctx, at);
  source.connect(high).connect(low).connect(env).connect(out);
  source.stop(at + duration + 0.05);

  return {
    stop(when = ctx.currentTime) {
      record({ kind: "stop", at: when });
      fadeOut(env.gain, when, 0.08);
      try {
        source.stop(when + 0.4);
      } catch {
        // Already stopped.
      }
    },
  };
}

/**
 * A quiet bee-hum to match pitch with through Bhramari's exhale. A little
 * vibrato keeps it from sounding like a test tone.
 */
export function scheduleHum(
  ctx: BaseAudioContext,
  out: AudioNode,
  opts: { at: number; duration: number; hz?: number; peak?: number },
): Voice {
  const { at, duration, hz = 174.61, peak = 0.07 } = opts;
  const end = at + duration;
  const fade = Math.min(0.5, duration * 0.2);
  record({ kind: "hum", at, duration, hz });

  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, at);
  env.gain.exponentialRampToValueAtTime(peak, at + fade);
  env.gain.setValueAtTime(peak, Math.max(at + fade, end - fade));
  env.gain.exponentialRampToValueAtTime(SILENT, end);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  env.connect(tone).connect(out);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = hz;

  // Vibrato: a slow wobble of a couple of hertz, like a hum held in the chest.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 1.8;
  lfo.connect(lfoGain).connect(osc.frequency);

  const body = ctx.createGain();
  body.gain.value = 0.5;
  osc.connect(body).connect(env);
  osc.start(at);
  lfo.start(at);
  osc.stop(end + 0.05);
  lfo.stop(end + 0.05);

  return {
    stop(when = ctx.currentTime) {
      fadeOut(env.gain, when, 0.05);
      for (const node of [osc, lfo]) {
        try {
          node.stop(when + 0.2);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Ambience: something underneath, at its own volume
// ---------------------------------------------------------------------------

export type Ambience = "none" | "rain" | "waves" | "brown" | "tanpura";

export type AmbienceHandle = {
  setVolume: (volume: number) => void;
  stop: (when?: number) => void;
};

/** Loudest each bed gets, at volume 100. Tuned so none of them drowns the guide. */
const BED_PEAK: Record<Exclude<Ambience, "none">, number> = {
  rain: 0.16,
  waves: 0.2,
  brown: 0.14,
  tanpura: 0.09,
};

const FADE_IN = 2;
const FADE_OUT = 1.5;

/**
 * A bed that plays under the guidance until the practice ends.
 *
 * All four are synthesised, so there is nothing to download and nothing to
 * license. The tanpura is an approximation -- four detuned strings through a
 * low-pass, shimmering slowly -- not a recording of one.
 */
export function startAmbience(
  ctx: BaseAudioContext,
  out: AudioNode,
  kind: Ambience,
  volume: number,
  at = ctx.currentTime,
): AmbienceHandle | null {
  if (kind === "none") return null;
  const level = Math.min(1, Math.max(0, volume / 100));
  record({ kind: "ambience", at, bed: kind, volume: level });

  const master = ctx.createGain();
  master.gain.setValueAtTime(SILENT, at);
  master.gain.exponentialRampToValueAtTime(
    Math.max(SILENT * 2, BED_PEAK[kind] * level),
    at + FADE_IN,
  );
  master.connect(out);

  const sources: Array<AudioBufferSourceNode | OscillatorNode> = [];

  if (kind === "rain") {
    // Two layers: a bright patter and the hiss underneath it.
    const patter = ctx.createBiquadFilter();
    patter.type = "bandpass";
    patter.frequency.value = 3200;
    patter.Q.value = 0.6;
    const patterGain = ctx.createGain();
    patterGain.gain.value = 0.55;
    const a = loopingNoise(ctx, at);
    a.connect(patter).connect(patterGain).connect(master);
    sources.push(a);

    const hiss = ctx.createBiquadFilter();
    hiss.type = "lowpass";
    hiss.frequency.value = 900;
    const b = loopingNoise(ctx, at);
    b.connect(hiss).connect(master);
    sources.push(b);
  } else if (kind === "waves") {
    // Sea that is not synced to your breath: a slow swell of its own.
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 700;
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07; // about fourteen seconds a wave
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(swell.gain);
    lfo.start(at);
    sources.push(lfo);

    const source = loopingNoise(ctx, at);
    source.connect(low).connect(swell).connect(master);
    sources.push(source);
  } else if (kind === "brown") {
    // Pink noise pushed down to a brown-ish slope: a deep, even hush.
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 260;
    const low2 = ctx.createBiquadFilter();
    low2.type = "lowpass";
    low2.frequency.value = 420;
    const source = loopingNoise(ctx, at);
    source.connect(low).connect(low2).connect(master);
    sources.push(source);
  } else {
    // Tanpura: Pa, Sa, Sa, Sa an octave down, detuned a little and shimmering
    // at slightly different rates so the drone never sits still.
    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = 1100;
    body.connect(master);

    const strings = [
      { hz: 98.0, level: 0.5, shimmer: 0.07 }, // Pa
      { hz: 130.81, level: 0.75, shimmer: 0.09 }, // Sa
      { hz: 130.81 * 1.004, level: 0.6, shimmer: 0.06 }, // Sa, barely detuned
      { hz: 65.41, level: 0.45, shimmer: 0.05 }, // Sa, an octave below
    ];
    for (const { hz, level, shimmer } of strings) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.value = level * 0.5;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = shimmer;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = level * 0.35;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start(at);

      osc.connect(gain).connect(body);
      osc.start(at);
      sources.push(osc, lfo);
    }
  }

  return {
    setVolume(next: number) {
      const v = Math.min(1, Math.max(0, next / 100));
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(SILENT, master.gain.value), now);
      master.gain.linearRampToValueAtTime(Math.max(SILENT, BED_PEAK[kind] * v), now + 0.2);
    },
    stop(when = ctx.currentTime) {
      record({ kind: "stop", at: when });
      master.gain.cancelScheduledValues(when);
      master.gain.setValueAtTime(Math.max(SILENT, master.gain.value), when);
      master.gain.exponentialRampToValueAtTime(SILENT, when + FADE_OUT);
      for (const node of sources) {
        try {
          node.stop(when + FADE_OUT + 0.1);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}
