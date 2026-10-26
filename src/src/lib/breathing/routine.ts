import type { Database } from "@/lib/database.types";
import { buildCycle, cyclesForMinutes, lengthLabel, type Cycle } from "./engine";
import { INTENTS, needsConfirming, type Intent, type Pattern } from "./pattern";

type RoutineRow = Database["public"]["Tables"]["breathing_routines"]["Row"];

/**
 * A routine: two to four practices run back to back inside one session.
 *
 * A step names a practice and says how long that step is in one of the two
 * units the setup screen offers -- minutes, or a count of breaths. The length
 * is stored as the intent rather than as a cycle count so that a practice you
 * have retimed still runs for about as long as the routine says it will.
 * `resolveRoutine` turns the intent into real cycles against whatever phases
 * that practice actually has for you.
 */
export type RoutineStep = {
  slug: string;
  /** Exactly one of these is set. */
  minutes?: number;
  cycles?: number;
};

export type Routine = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string;
  about: string | null;
  intents: Intent[];
  steps: RoutineStep[];
};

/** One step with its practice found and its length worked out. */
export type ResolvedStep = {
  pattern: Pattern;
  cycle: Cycle;
  cycles: number;
  seconds: number;
  /** "2 min", "5 breaths" -- the same words the setup screen uses. */
  label: string;
};

export type ResolvedRoutine = {
  routine: Routine;
  steps: ResolvedStep[];
  /** The practice itself, without settling in between steps. */
  seconds: number;
};

export const ROUTINE_COLUMNS =
  "id, slug, name, subtitle, description, about, steps, intents" as const;

type RoutineColumns =
  | "id" | "slug" | "name" | "subtitle" | "description" | "about" | "steps" | "intents";

const INTENT_SET: ReadonlySet<string> = new Set(INTENTS.map((i) => i.value));

/** The longest a routine may be: six steps, matching the column's own check. */
export const MAX_STEPS = 6;

/**
 * `steps` is jsonb, so the database only promises "an array". A malformed step
 * list is refused here rather than handed to the player.
 */
export function parseSteps(value: unknown): RoutineStep[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_STEPS) return null;

  const out: RoutineStep[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.slug !== "string" || s.slug.trim() === "") return null;

    const minutes = typeof s.minutes === "number" && Number.isFinite(s.minutes) ? s.minutes : null;
    const cycles = typeof s.cycles === "number" && Number.isInteger(s.cycles) ? s.cycles : null;
    // Exactly one unit, or the step has no length at all.
    if ((minutes === null) === (cycles === null)) return null;
    if (minutes !== null && (minutes <= 0 || minutes > 60)) return null;
    if (cycles !== null && (cycles < 1 || cycles > 1000)) return null;

    out.push(minutes !== null ? { slug: s.slug, minutes } : { slug: s.slug, cycles: cycles as number });
  }
  return out;
}

/** Null for a row whose steps are unusable, so one bad row hides itself instead of breaking the list. */
export function routineFromRow(row: Pick<RoutineRow, RoutineColumns>): Routine | null {
  const steps = parseSteps(row.steps);
  if (!steps) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    about: row.about,
    intents: (row.intents ?? []).filter((i): i is Intent => INTENT_SET.has(i)),
    steps,
  };
}

/**
 * A routine against the practices this person actually has.
 *
 * Returns null when any step names a practice that is not there, because a
 * routine that silently drops a step is worse than one that does not appear:
 * "Downshift" without the sigh is not Downshift.
 */
export function resolveRoutine(routine: Routine, patterns: Pattern[]): ResolvedRoutine | null {
  const steps: ResolvedStep[] = [];

  for (const step of routine.steps) {
    const pattern = patterns.find((p) => p.kind === "builtin" && p.slug === step.slug);
    if (!pattern) return null;
    // A practice behind a safety confirmation cannot be a step. A routine runs
    // straight through without asking, which is exactly what that confirmation
    // exists to prevent.
    if (needsConfirming(pattern.phases)) return null;

    const cycle = buildCycle(pattern.phases);
    const cycles =
      step.minutes !== undefined
        ? cyclesForMinutes(cycle, step.minutes, pattern.maxCycles)
        : Math.max(1, Math.min(step.cycles as number, pattern.maxCycles ?? Infinity));

    // Labelled in the unit the step was written in. `lengthLabel` picks the
    // unit from the practice's own cap, which would show a step asked for as
    // "5 breaths" as "45 sec" -- true, but not what the routine said.
    const breaths = cycles * cycle.breaths;
    const label =
      step.cycles !== undefined
        ? `${breaths} ${breaths === 1 ? "breath" : "breaths"}`
        : lengthLabel(cycle, cycles, pattern.maxCycles);

    steps.push({ pattern, cycle, cycles, seconds: cycle.seconds * cycles, label });
  }

  return { routine, steps, seconds: steps.reduce((n, s) => n + s.seconds, 0) };
}

/** "About 5 min", for a routine card. Rounded, because the steps rarely land on a whole minute. */
export function routineLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? "Under a minute" : `About ${minutes} min`;
}

/** "Sigh · Extended Exhale · Coherent", for the card. */
export const stepNames = (steps: ResolvedStep[]) => steps.map((s) => s.pattern.name).join(" · ");

// ---------------------------------------------------------------------------
// The routine URL
//
// A routine session runs at /breathe/routine/[slug]/session. Only the sound
// and check-in options travel in the URL -- the lengths belong to the routine,
// not to the person, which is the whole point of it being a routine.
// ---------------------------------------------------------------------------

/** A routine's own slug lives under /breathe/routine/, so it cannot collide with a practice. */
export const routineHref = (slug: string, basePath = "/breathe") => `${basePath}/routine/${slug}`;
