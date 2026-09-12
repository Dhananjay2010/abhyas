/**
 * Rules for a recorded practice and for breathing preferences, shared by the
 * player and the server actions.
 *
 * Lives outside `app/breathe/actions.ts` because a "use server" module may
 * only export async functions. The same rule runs in the browser, so a bad
 * save explains itself without a round trip, and again on the server, which is
 * the copy that protects the database. The CHECK constraints in the migration
 * are the last line behind both.
 */
import type { BreathPhase } from "./engine";
import {
  DEFAULT_MINUTE_CHOICES,
  isAmbience,
  isGuidance,
  isVoiceLang,
  type Ambience,
  type CheckIn,
  type Guidance,
  type VoiceLang,
} from "./pattern";

export type PracticeInput = {
  /** Chosen by the client, so a retried save is recognised rather than doubled. */
  logId: string;
  /** One of ours. Null for a practice you made yourself. */
  patternId: string | null;
  /** Your row: your timings for one of ours, or your own practice. */
  userPatternId: string | null;
  /** Full cycles actually breathed. */
  cycles: number;
  plannedCycles: number;
  breaths: number;
  seconds: number;
  endedEarly: boolean;
  moodBefore: number | null;
  guidance: Guidance;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const whole = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

export const isMood = (n: unknown): n is number => whole(n, 1, 5);

export function validatePractice(p: PracticeInput): string | null {
  if (!UUID.test(p.logId)) return "That practice could not be identified.";
  if (p.patternId !== null && !UUID.test(p.patternId)) return "That practice could not be identified.";
  if (p.userPatternId !== null && !UUID.test(p.userPatternId)) {
    return "That practice could not be identified.";
  }
  if (p.patternId === null && p.userPatternId === null) {
    return "That practice could not be identified.";
  }
  if (!whole(p.cycles, 1, 1000)) return "A practice needs at least one full breath to be saved.";
  if (!whole(p.plannedCycles, 1, 1000)) return "That practice length is not valid.";
  if (p.cycles > p.plannedCycles) return "More breaths were recorded than were planned.";
  if (!whole(p.breaths, 1, 2000)) return "That breath count is not valid.";
  if (!whole(p.seconds, 1, 7200)) return "That practice length is not valid.";
  if (typeof p.endedEarly !== "boolean") return "That practice could not be saved.";
  if (p.moodBefore !== null && !isMood(p.moodBefore)) return "That check-in is not valid.";
  if (!isGuidance(p.guidance)) return "That sound setting is not valid.";
  return null;
}

// ---------------------------------------------------------------------------
// Your own timings, and your own practices
//
// Wide enough for anything anyone actually breathes, narrow enough that a
// practice cannot be made unusable: a phase of a tenth of a second, or a cycle
// ten minutes long, is a mistake rather than a preference.
// ---------------------------------------------------------------------------

export const PHASE_STEP = 0.5;
export const MIN_PHASE_SECONDS = 0.5;
export const MAX_PHASE_SECONDS = 60;
export const MAX_CYCLE_SECONDS = 300;
export const MAX_PHASES = 12;
export const MAX_CUSTOM_PATTERNS = 20;
export const MAX_NAME_LENGTH = 60;

export type PatternDraft = { name: string; phases: BreathPhase[] };

/** On the half-second, allowing for the usual floating-point untidiness. */
const onStep = (n: number) => Math.abs(n / PHASE_STEP - Math.round(n / PHASE_STEP)) < 1e-6;

export function validatePatternDraft(draft: PatternDraft): string | null {
  const name = draft.name.trim();
  if (name.length < 1) return "Give it a name.";
  if (name.length > MAX_NAME_LENGTH) return `Keep the name under ${MAX_NAME_LENGTH} characters.`;

  const phases = draft.phases;
  if (!Array.isArray(phases) || phases.length < 1) return "A practice needs at least one phase.";
  if (phases.length > MAX_PHASES) return `A practice can have at most ${MAX_PHASES} phases.`;

  let total = 0;
  for (const p of phases) {
    if (p.kind !== "inhale" && p.kind !== "hold" && p.kind !== "exhale") {
      return "That phase is not valid.";
    }
    if (typeof p.seconds !== "number" || !Number.isFinite(p.seconds)) return "That timing is not valid.";
    if (p.seconds !== 0) {
      if (p.seconds < MIN_PHASE_SECONDS) return `Each phase is at least ${MIN_PHASE_SECONDS} seconds.`;
      if (p.seconds > MAX_PHASE_SECONDS) return `Each phase is at most ${MAX_PHASE_SECONDS} seconds.`;
      if (!onStep(p.seconds)) return "Timings go in half-seconds.";
    }
    if (typeof p.cue !== "string" || p.cue.trim() === "") return "Every phase needs words.";
    total += p.seconds;
  }

  if (!phases.some((p) => p.kind === "inhale" && p.seconds > 0)) return "A breath needs a way in.";
  if (!phases.some((p) => p.kind === "exhale" && p.seconds > 0)) return "A breath needs a way out.";
  if (total > MAX_CYCLE_SECONDS) {
    return `One breath can be at most ${MAX_CYCLE_SECONDS / 60} minutes long.`;
  }
  return null;
}

export type PrefsPatch = Partial<{
  defaultMinutes: number;
  guidance: Guidance;
  ambience: Ambience;
  ambienceVolume: number;
  voiceLang: VoiceLang;
  showCount: boolean;
  vibrate: boolean;
  settleIn: boolean;
  checkIn: CheckIn;
}>;

export function validatePrefs(p: PrefsPatch): string | null {
  if (p.defaultMinutes !== undefined && !DEFAULT_MINUTE_CHOICES.includes(p.defaultMinutes)) {
    return "Choose one of the listed lengths.";
  }
  if (p.guidance !== undefined && !isGuidance(p.guidance)) {
    return "That sound setting is not valid.";
  }
  if (p.ambience !== undefined && !isAmbience(p.ambience)) {
    return "That background sound is not valid.";
  }
  if (p.voiceLang !== undefined && !isVoiceLang(p.voiceLang)) {
    return "That voice language is not valid.";
  }
  if (
    p.ambienceVolume !== undefined &&
    !(Number.isInteger(p.ambienceVolume) && p.ambienceVolume >= 0 && p.ambienceVolume <= 100)
  ) {
    return "That volume is not valid.";
  }
  if (p.checkIn !== undefined && p.checkIn !== "off" && p.checkIn !== "after" && p.checkIn !== "both") {
    return "That check-in setting is not valid.";
  }
  for (const key of ["showCount", "vibrate", "settleIn"] as const) {
    if (p[key] !== undefined && typeof p[key] !== "boolean") return "That setting is not valid.";
  }
  return null;
}
