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
  | { kind: "bell"; at: number; hz: number }
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
