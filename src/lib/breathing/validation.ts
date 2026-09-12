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
  patternId: string;
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
  if (!UUID.test(p.logId) || !UUID.test(p.patternId)) return "That practice could not be identified.";
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
