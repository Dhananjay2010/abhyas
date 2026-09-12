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
    if (p.hum === true) phase.hum = true;
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

export type Guidance = "tones" | "ocean" | "voice" | "off";
export type CheckIn = "off" | "after" | "both";
export type Ambience = "none" | "rain" | "waves" | "brown" | "tanpura";
export type VoiceLang = "en" | "hi";

export const GUIDANCE_OPTIONS: ReadonlyArray<{ value: Guidance; label: string; hint: string }> = [
  { value: "tones", label: "Tones", hint: "A soft tone rises as you breathe in and falls as you breathe out." },
  { value: "ocean", label: "Ocean", hint: "A wave swells as you breathe in and ebbs as you breathe out." },
  { value: "voice", label: "Voice", hint: "Your phone says each cue out loud." },
  { value: "off", label: "Off", hint: "Nothing but the screen." },
];

export const AMBIENCE_OPTIONS: ReadonlyArray<{ value: Ambience; label: string }> = [
  { value: "none", label: "None" },
  { value: "rain", label: "Rain" },
  { value: "waves", label: "Waves" },
  { value: "brown", label: "Hush" },
  { value: "tanpura", label: "Tanpura" },
];

export const VOICE_LANGS: ReadonlyArray<{ value: VoiceLang; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

const GUIDANCES: ReadonlySet<string> = new Set(GUIDANCE_OPTIONS.map((g) => g.value));
const AMBIENCES: ReadonlySet<string> = new Set(AMBIENCE_OPTIONS.map((a) => a.value));

export const isGuidance = (v: unknown): v is Guidance => typeof v === "string" && GUIDANCES.has(v);
export const isAmbience = (v: unknown): v is Ambience => typeof v === "string" && AMBIENCES.has(v);
export const isVoiceLang = (v: unknown): v is VoiceLang => v === "en" || v === "hi";

export type BreathingPrefs = {
  /** The usual length, in minutes. Stored in `meditation_default_minutes`. */
  defaultMinutes: number;
  guidance: Guidance;
  /** The bed under the guidance, and how loud it is (0-100). */
  ambience: Ambience;
  ambienceVolume: number;
  voiceLang: VoiceLang;
  showCount: boolean;
  vibrate: boolean;
  settleIn: boolean;
  checkIn: CheckIn;
};

export const DEFAULT_PREFS: BreathingPrefs = {
  defaultMinutes: 10,
  guidance: "tones",
  ambience: "none",
  ambienceVolume: 40,
  voiceLang: "en",
  showCount: true,
  vibrate: true,
  settleIn: true,
  checkIn: "after",
};

export const PREFS_COLUMNS =
  "meditation_default_minutes, breathing_guidance, breathing_ambience, breathing_ambience_volume, breathing_voice_lang, breathing_show_count, breathing_vibrate, breathing_settle_in, breathing_check_in" as const;

type PrefsColumns =
  | "meditation_default_minutes" | "breathing_guidance" | "breathing_ambience"
  | "breathing_ambience_volume" | "breathing_voice_lang" | "breathing_show_count"
  | "breathing_vibrate" | "breathing_settle_in" | "breathing_check_in";

export function prefsFromRow(row: Pick<SettingsRow, PrefsColumns> | null): BreathingPrefs {
  if (!row) return DEFAULT_PREFS;
  return {
    defaultMinutes: row.meditation_default_minutes,
    guidance: isGuidance(row.breathing_guidance) ? row.breathing_guidance : DEFAULT_PREFS.guidance,
    ambience: isAmbience(row.breathing_ambience) ? row.breathing_ambience : DEFAULT_PREFS.ambience,
    ambienceVolume: clampVolume(row.breathing_ambience_volume),
    voiceLang: isVoiceLang(row.breathing_voice_lang) ? row.breathing_voice_lang : DEFAULT_PREFS.voiceLang,
    showCount: row.breathing_show_count,
    vibrate: row.breathing_vibrate,
    settleIn: row.breathing_settle_in,
    checkIn:
      row.breathing_check_in === "off" || row.breathing_check_in === "both"
        ? row.breathing_check_in
        : "after",
  };
}

export const VOLUME_STEP = 10;

export function clampVolume(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : DEFAULT_PREFS.ambienceVolume;
  return Math.min(100, Math.max(0, n));
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
  ambience: Ambience;
  ambienceVolume: number;
  voiceLang: VoiceLang;
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
    amb: o.ambience,
    vol: String(o.ambienceVolume),
    lang: o.voiceLang,
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
  const amb = one(search.amb);
  const lang = one(search.lang);
  const vol = Number(one(search.vol));
  const checkin = one(search.checkin);
  return {
    cycles,
    guidance: isGuidance(sound) ? sound : prefs.guidance,
    ambience: isAmbience(amb) ? amb : prefs.ambience,
    ambienceVolume: Number.isFinite(vol) ? clampVolume(vol) : prefs.ambienceVolume,
    voiceLang: isVoiceLang(lang) ? lang : prefs.voiceLang,
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
