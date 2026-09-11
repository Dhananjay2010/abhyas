import type { Database } from "@/lib/database.types";
import type { BreathPhase, PhaseKind, Side } from "./engine";

type PatternRow = Database["public"]["Tables"]["breathing_patterns"]["Row"];
type SettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

export type Intent = "calm" | "sleep" | "focus" | "energy" | "recover" | "balance";

/** In the order the chips appear. A chip with no practice behind it is not shown. */
export const INTENTS: ReadonlyArray<{ value: Intent; label: string }> = [
  { value: "calm", label: "Calm" },
  { value: "sleep", label: "Sleep" },
  { value: "focus", label: "Focus" },
  { value: "energy", label: "Energy" },
  { value: "recover", label: "Recover" },
  { value: "balance", label: "Balance" },
];
const INTENT_SET: ReadonlySet<string> = new Set(INTENTS.map((i) => i.value));

export type Pattern = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  benefit: string | null;
  contraindications: string | null;
  level: string;
  intents: Intent[];
  phases: BreathPhase[];
  maxCycles: number | null;
  defaultCycles: number;
  howTo: string[];
  why: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
};

/** Exactly the columns `patternFromRow` reads. A literal, so Supabase infers the row type from it. */
export const PATTERN_COLUMNS =
  "id, slug, name, subtitle, description, benefit, contraindications, level, intents, phases, max_cycles, default_cycles, how_to, why, evidence_label, evidence_url" as const;

type PatternColumns =
  | "id" | "slug" | "name" | "subtitle" | "description" | "benefit" | "contraindications"
  | "level" | "intents" | "phases" | "max_cycles" | "default_cycles" | "how_to" | "why"
  | "evidence_label" | "evidence_url";

const KINDS: ReadonlySet<string> = new Set<PhaseKind>(["inhale", "hold", "exhale"]);

/**
 * `phases` is jsonb, so the database only promises "an array". Anything that is
 * not a well-formed phase list is refused here rather than handed to the
 * player, where it would surface as a session that freezes or ends at once.
 */
export function parsePhases(value: unknown): BreathPhase[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const out: BreathPhase[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.kind !== "string" || !KINDS.has(p.kind)) return null;
    if (typeof p.seconds !== "number" || !Number.isFinite(p.seconds)) return null;
    if (p.seconds < 0 || p.seconds > 120) return null;
    if (typeof p.cue !== "string" || p.cue.trim() === "") return null;

    const phase: BreathPhase = { kind: p.kind as PhaseKind, seconds: p.seconds, cue: p.cue };
    if (typeof p.label === "string" && p.label.trim() !== "") phase.label = p.label;
    if (p.side === "left" || p.side === "right") phase.side = p.side as Side;
    if (typeof p.to === "number" && p.to >= 0 && p.to <= 1) phase.to = p.to;
    out.push(phase);
  }

  // A breath needs a way in and a way out.
  if (!out.some((p) => p.kind === "inhale" && p.seconds > 0)) return null;
  if (!out.some((p) => p.kind === "exhale" && p.seconds > 0)) return null;
  return out;
}

/** Null for a row whose phases are unusable, so one bad row hides itself instead of breaking the list. */
export function patternFromRow(row: Pick<PatternRow, PatternColumns>): Pattern | null {
  const phases = parsePhases(row.phases);
  if (!phases) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    benefit: row.benefit,
    contraindications: row.contraindications,
    level: row.level,
    intents: (row.intents ?? []).filter((i): i is Intent => INTENT_SET.has(i)),
    phases,
    maxCycles: row.max_cycles,
    defaultCycles: row.default_cycles,
    howTo: row.how_to ?? [],
    why: row.why,
    evidenceLabel: row.evidence_label,
    evidenceUrl: row.evidence_url,
  };
}

/** "5.5s", "4s". */
export const secondsLabel = (s: number) => `${Number.isInteger(s) ? s : s.toFixed(1)}s`;

export const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Advanced",
};

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type Guidance = "tones" | "off";
export type CheckIn = "off" | "after" | "both";

export type BreathingPrefs = {
  /** The usual length, in minutes. Stored in `meditation_default_minutes`. */
  defaultMinutes: number;
  guidance: Guidance;
  showCount: boolean;
  vibrate: boolean;
  settleIn: boolean;
  checkIn: CheckIn;
};

export const DEFAULT_PREFS: BreathingPrefs = {
  defaultMinutes: 10,
  guidance: "tones",
  showCount: true,
  vibrate: true,
  settleIn: true,
  checkIn: "after",
};

export const PREFS_COLUMNS =
  "meditation_default_minutes, breathing_guidance, breathing_show_count, breathing_vibrate, breathing_settle_in, breathing_check_in" as const;

type PrefsColumns =
  | "meditation_default_minutes" | "breathing_guidance" | "breathing_show_count"
  | "breathing_vibrate" | "breathing_settle_in" | "breathing_check_in";

export function prefsFromRow(row: Pick<SettingsRow, PrefsColumns> | null): BreathingPrefs {
  if (!row) return DEFAULT_PREFS;
  return {
    defaultMinutes: row.meditation_default_minutes,
    guidance: row.breathing_guidance === "off" ? "off" : "tones",
    showCount: row.breathing_show_count,
    vibrate: row.breathing_vibrate,
    settleIn: row.breathing_settle_in,
    checkIn:
      row.breathing_check_in === "off" || row.breathing_check_in === "both"
        ? row.breathing_check_in
        : "after",
  };
}

/** 30 stays because Settings used to offer it, and someone may have chosen it there. */
export const DEFAULT_MINUTE_CHOICES = [1, 3, 5, 10, 20, 30];

// ---------------------------------------------------------------------------
// The options a session runs with
//
// Carried in the session URL rather than re-read from the database, so what
// was chosen on the setup screen is exactly what runs -- even when the save
// of a just-changed preference has not landed yet.
// ---------------------------------------------------------------------------

export type SessionOptions = {
  cycles: number;
  guidance: Guidance;
  showCount: boolean;
  vibrate: boolean;
  settleIn: boolean;
  checkIn: CheckIn;
};

/** The longest single practice: an hour, the same bound as a custom length. */
export const MAX_SESSION_SECONDS = 3600;

export function sessionSearch(o: SessionOptions): string {
  const q = new URLSearchParams({
    cycles: String(o.cycles),
    sound: o.guidance,
    count: o.showCount ? "1" : "0",
    vib: o.vibrate ? "1" : "0",
    settle: o.settleIn ? "1" : "0",
    checkin: o.checkIn,
  });
  return `?${q.toString()}`;
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const flag = (v: string | undefined, fallback: boolean) =>
  v === "1" ? true : v === "0" ? false : fallback;

/**
 * Read a session URL back. Every field falls back to the user's preferences,
 * and the length is held inside the pattern's cap and the one-hour bound, so a
 * hand-edited URL cannot start a practice the setup screen would refuse.
 */
export function parseSessionSearch(
  search: Search,
  prefs: BreathingPrefs,
  opts: { fallbackCycles: number; maxCycles: number | null; cycleSeconds: number },
): SessionOptions {
  const ceiling = Math.max(
    1,
    Math.min(opts.maxCycles ?? Infinity, Math.floor(MAX_SESSION_SECONDS / opts.cycleSeconds)),
  );
  const asked = Number(one(search.cycles));
  const cycles = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, ceiling) : Math.min(opts.fallbackCycles, ceiling);

  const sound = one(search.sound);
  const checkin = one(search.checkin);
  return {
    cycles,
    guidance: sound === "tones" || sound === "off" ? sound : prefs.guidance,
    showCount: flag(one(search.count), prefs.showCount),
    vibrate: flag(one(search.vib), prefs.vibrate),
    settleIn: flag(one(search.settle), prefs.settleIn),
    checkIn: checkin === "off" || checkin === "after" || checkin === "both" ? checkin : prefs.checkIn,
  };
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export const MOODS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Tense" },
  { value: 2, label: "Uneasy" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Settled" },
  { value: 5, label: "Calm" },
];

export const moodLabel = (n: number | null | undefined) =>
  MOODS.find((m) => m.value === n)?.label ?? null;
