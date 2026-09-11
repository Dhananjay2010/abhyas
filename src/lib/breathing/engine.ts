/**
 * The breathing timeline, as pure functions of time.
 *
 * The first pacer was a state machine: an interval ticked, and each tick
 * decided whether to move to the next phase. Both of its bugs lived in that
 * machinery -- a timer that never advanced, and every cycle counted twice
 * (context/12). There is no machinery here. Given a pattern and the seconds
 * elapsed, `positionAt` says exactly where a practice is: which cycle, which
 * phase, how far through it, and how big the orb should be. The player only
 * has to keep an honest clock, and pausing, resuming, skipping the settle-in
 * or a tab that slept for a minute all fall out of the arithmetic.
 */

export type PhaseKind = "inhale" | "hold" | "exhale";
export type Side = "left" | "right";

/** One phase as a pattern stores it (`breathing_patterns.phases`). */
export type BreathPhase = {
  kind: PhaseKind;
  seconds: number;
  /** What the screen says during the phase. */
  cue: string;
  /** Short name for the rhythm chips. In / Hold / Out by default. */
  label?: string;
  /** Which nostril is open, for alternate-nostril patterns. */
  side?: Side;
  /** Orb size the phase ends at, 0..1. An inhale ends at 1 and an exhale at 0 unless told otherwise. */
  to?: number;
};

export type TimedPhase = {
  index: number;
  kind: PhaseKind;
  seconds: number;
  cue: string;
  label: string;
  side: Side | null;
  /** Seconds from the start of the cycle. */
  offset: number;
  /** Orb size at the start and at the end of the phase, 0..1. */
  from: number;
  to: number;
};

export type Cycle = {
  phases: TimedPhase[];
  /** Length of one cycle, in seconds. */
  seconds: number;
  /**
   * Breaths in one cycle. Nadi Shodhana has two, one per side. The sigh's
   * sniff is part of its inhale, not a second breath.
   */
  breaths: number;
};

export type Position = {
  done: boolean;
  /** 0-based. Stays on the last cycle once the practice is done. */
  cycleIndex: number;
  completedCycles: number;
  phase: TimedPhase;
  phaseElapsed: number;
  phaseRemaining: number;
  /** How far through the current phase, 0..1. */
  progress: number;
  /** The eased orb size, 0..1. */
  size: number;
  elapsed: number;
  total: number;
};

// Floating-point slack for phase boundaries. 5.5-second phases add up to
// totals that are not always exact in binary.
const EPS = 1e-9;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Slow at the turn of the breath and fastest in the middle, the way lungs move. */
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

const DEFAULT_LABEL: Record<PhaseKind, string> = { inhale: "In", hold: "Hold", exhale: "Out" };

export function buildCycle(input: BreathPhase[]): Cycle {
  const phases = input.filter((p) => p.seconds > 0);
  if (phases.length === 0) {
    throw new Error("A breathing pattern needs at least one timed phase.");
  }

  // A hold keeps whatever size the phase before it ended at, and the first
  // phase's "before" is the last phase of the previous cycle. Walking the
  // cycle twice lands on that steady state whichever way the pattern starts.
  let size = 0;
  let sizes: Array<{ from: number; to: number }> = [];
  for (let pass = 0; pass < 2; pass++) {
    sizes = phases.map((p) => {
      const from = size;
      const to =
        p.kind === "inhale"
          ? clamp(p.to ?? 1, 0, 1)
          : p.kind === "exhale"
            ? clamp(p.to ?? 0, 0, 1)
            : from;
      size = to;
      return { from, to };
    });
  }

  let offset = 0;
  const timed = phases.map((p, index): TimedPhase => {
    const phase: TimedPhase = {
      index,
      kind: p.kind,
      seconds: p.seconds,
      cue: p.cue,
      label: p.label ?? DEFAULT_LABEL[p.kind],
      side: p.side ?? null,
      offset,
      from: sizes[index].from,
      to: sizes[index].to,
    };
    offset += p.seconds;
    return phase;
  });

  const breaths = timed.filter(
    (p, i) =>
      p.kind === "inhale" && timed[(i - 1 + timed.length) % timed.length].kind !== "inhale",
  ).length;

  return { phases: timed, seconds: offset, breaths: Math.max(1, breaths) };
}

export function positionAt(cycle: Cycle, cycles: number, t: number): Position {
  const total = cycle.seconds * cycles;
  const last = cycle.phases[cycle.phases.length - 1];

  if (t >= total - EPS) {
    return {
      done: true,
      cycleIndex: cycles - 1,
      completedCycles: cycles,
      phase: last,
      phaseElapsed: last.seconds,
      phaseRemaining: 0,
      progress: 1,
      size: last.to,
      elapsed: total,
      total,
    };
  }

  const elapsed = Math.max(0, t);
  const cycleIndex = Math.min(cycles - 1, Math.floor((elapsed + EPS) / cycle.seconds));
  const within = elapsed - cycleIndex * cycle.seconds;

  let phase = cycle.phases[0];
  for (const p of cycle.phases) {
    if (p.offset <= within + EPS) phase = p;
    else break;
  }

  const phaseElapsed = Math.max(0, within - phase.offset);
  const progress = clamp(phaseElapsed / phase.seconds, 0, 1);

  return {
    done: false,
    cycleIndex,
    completedCycles: cycleIndex,
    phase,
    phaseElapsed,
    phaseRemaining: Math.max(0, phase.seconds - phaseElapsed),
    progress,
    size: phase.from + (phase.to - phase.from) * easeInOutSine(progress),
    elapsed,
    total,
  };
}

/**
 * The next phase to begin after `t`, or null when the practice ends first.
 *
 * A negative `t` is the settle-in before the practice, and the answer is the
 * very first phase. This is what lets sound be scheduled a moment ahead on
 * the audio clock instead of fired late from a frame callback.
 */
export function nextPhaseStart(
  cycle: Cycle,
  cycles: number,
  t: number,
): { at: number; cycleIndex: number; phase: TimedPhase } | null {
  if (t < 0) return { at: 0, cycleIndex: 0, phase: cycle.phases[0] };

  const pos = positionAt(cycle, cycles, t);
  if (pos.done) return null;

  const at = pos.cycleIndex * cycle.seconds + pos.phase.offset + pos.phase.seconds;
  if (at >= pos.total - EPS) return null;

  const wraps = pos.phase.index === cycle.phases.length - 1;
  return {
    at,
    cycleIndex: wraps ? pos.cycleIndex + 1 : pos.cycleIndex,
    phase: cycle.phases[wraps ? 0 : pos.phase.index + 1],
  };
}

// ---------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------

/**
 * Patterns capped this short are chosen in breaths rather than minutes. "Four
 * breaths" is how 4-7-8 is taught, and "1 min" would already be most of its
 * cap.
 */
const BREATHS_UNIT_SECONDS = 180;
const MINUTE_CHOICES = [1, 3, 5, 10];
export const MAX_CUSTOM_MINUTES = 60;

export type LengthOption = { cycles: number; label: string };
export type LengthPlan = {
  unit: "minutes" | "breaths";
  options: LengthOption[];
  /** Upper bound for a custom length in minutes, or null when custom is not offered. */
  maxMinutes: number | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whole cycles closest to the requested minutes. A practice never stops mid-breath. */
export function cyclesForMinutes(cycle: Cycle, minutes: number, maxCycles: number | null): number {
  const n = Math.max(1, Math.round((minutes * 60) / cycle.seconds));
  return maxCycles ? Math.min(n, maxCycles) : n;
}

export function lengthPlan(cycle: Cycle, maxCycles: number | null): LengthPlan {
  if (maxCycles && maxCycles * cycle.seconds <= BREATHS_UNIT_SECONDS) {
    const counts = [
      ...new Set([
        Math.ceil(maxCycles / 4),
        Math.ceil(maxCycles / 2),
        Math.ceil((3 * maxCycles) / 4),
        maxCycles,
      ]),
    ].filter((n) => n >= 1);
    return {
      unit: "breaths",
      options: counts.map((c) => ({ cycles: c, label: plural(c * cycle.breaths, "breath") })),
      maxMinutes: null,
    };
  }

  const seen = new Set<number>();
  const options: LengthOption[] = [];
  for (const m of MINUTE_CHOICES) {
    const raw = Math.max(1, Math.round((m * 60) / cycle.seconds));
    // A capped pattern must not offer a "10 min" that quietly runs for three.
    if (maxCycles && raw > maxCycles) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    options.push({ cycles: raw, label: `${m} min` });
  }

  const maxMinutes = maxCycles
    ? Math.max(1, Math.floor((maxCycles * cycle.seconds) / 60))
    : MAX_CUSTOM_MINUTES;
  return { unit: "minutes", options, maxMinutes };
}

/** How a chosen length reads everywhere it is shown: "5 min", "40 sec", "4 breaths". */
export function lengthLabel(cycle: Cycle, cycles: number, maxCycles: number | null): string {
  if (lengthPlan(cycle, maxCycles).unit === "breaths") {
    return plural(cycles * cycle.breaths, "breath");
  }
  const seconds = Math.round(cycle.seconds * cycles);
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

/**
 * Where a practice's length starts: what you did last time with this pattern,
 * else the pattern's own count if it is chosen in breaths, else your usual
 * minutes. Always inside the pattern's cap.
 */
export function initialCycles(opts: {
  cycle: Cycle;
  maxCycles: number | null;
  defaultCycles: number;
  preferredMinutes: number;
  lastCycles: number | null;
}): number {
  const { cycle, maxCycles, defaultCycles, preferredMinutes, lastCycles } = opts;
  const cap = (n: number) => Math.max(1, maxCycles ? Math.min(n, maxCycles) : n);
  if (lastCycles && lastCycles >= 1) return cap(lastCycles);
  if (lengthPlan(cycle, maxCycles).unit === "breaths") return cap(defaultCycles);
  return cyclesForMinutes(cycle, preferredMinutes, maxCycles);
}
