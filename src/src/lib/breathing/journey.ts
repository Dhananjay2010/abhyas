import type { Database } from "@/lib/database.types";
import { buildCycle, cyclesForMinutes, lengthLabel, type Cycle } from "./engine";
import { needsConfirming, type Pattern } from "./pattern";
import type { CalmShift } from "./stats";

type JourneyRow = Database["public"]["Tables"]["breathing_journeys"]["Row"];
type ProgressRow = Database["public"]["Tables"]["user_journey_progress"]["Row"];

/**
 * A journey: a short course, one practice a day.
 *
 * A day is a routine step with two things added -- a title and a sentence
 * saying what that day teaches -- because the point of a course is not the
 * practices but the order they are in and the reason for it.
 *
 * `pick: "best"` is a day the app chooses rather than the course: day seven of
 * Breath foundations is whichever practice your own check-ins rate highest.
 * `slug` is then the fallback, used until there are enough check-ins to mean
 * anything.
 */
export type JourneyDay = {
  slug: string;
  /** Exactly one of these is set, as with a routine step. */
  minutes?: number;
  cycles?: number;
  title: string;
  teaches: string;
  /** This day is chosen from your own check-ins, not by the course. */
  pick?: "best";
};

export type Journey = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string;
  about: string | null;
  days: JourneyDay[];
};

/** Where you are up to. A person who has never opened the course has none of this. */
export type JourneyProgress = {
  daysCompleted: number;
  startedOn: string;
  /** The local date the last day was counted on, or null before the first. */
  lastDayOn: string | null;
  completed: boolean;
};

export const NO_PROGRESS: JourneyProgress = {
  daysCompleted: 0,
  startedOn: "",
  lastDayOn: null,
  completed: false,
};

/** What a day is on the screen: done, open now, or still ahead. */
export type DayState = "done" | "today" | "tomorrow" | "ahead";

/** One day with its practice found and its length worked out. */
export type ResolvedDay = {
  day: JourneyDay;
  /** 1-based, as it reads on the screen. */
  number: number;
  pattern: Pattern;
  cycle: Cycle;
  cycles: number;
  seconds: number;
  /** "3 min", "6 breaths" -- the same words the setup screen uses. */
  label: string;
  state: DayState;
  /**
   * Set only on a `pick: "best"` day: why this practice and not another. Null
   * when there were not enough check-ins and the fallback is being used.
   */
  chosenBecause: string | null;
};

export type ResolvedJourney = {
  journey: Journey;
  days: ResolvedDay[];
  progress: JourneyProgress;
  /** The day that can be started right now, or null when there is none today. */
  today: ResolvedDay | null;
};

export const JOURNEY_COLUMNS =
  "id, slug, name, subtitle, description, about, days" as const;

type JourneyColumns =
  | "id" | "slug" | "name" | "subtitle" | "description" | "about" | "days";

export const PROGRESS_COLUMNS =
  "journey_id, days_completed, started_on, last_day_on, completed_at" as const;

type ProgressColumns =
  | "journey_id" | "days_completed" | "started_on" | "last_day_on" | "completed_at";

/** The longest a course may be, matching the column's own check. */
export const MAX_DAYS = 14;

/**
 * `days` is jsonb, so the database only promises "an array". A malformed day
 * list is refused here rather than handed to the player.
 */
export function parseDays(value: unknown): JourneyDay[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_DAYS) return null;

  const out: JourneyDay[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const d = raw as Record<string, unknown>;
    if (typeof d.slug !== "string" || d.slug.trim() === "") return null;
    if (typeof d.title !== "string" || d.title.trim() === "") return null;
    if (typeof d.teaches !== "string" || d.teaches.trim() === "") return null;

    const minutes = typeof d.minutes === "number" && Number.isFinite(d.minutes) ? d.minutes : null;
    const cycles = typeof d.cycles === "number" && Number.isInteger(d.cycles) ? d.cycles : null;
    // Exactly one unit, or the day has no length at all.
    if ((minutes === null) === (cycles === null)) return null;
    if (minutes !== null && (minutes <= 0 || minutes > 60)) return null;
    if (cycles !== null && (cycles < 1 || cycles > 1000)) return null;
    // Only "best" is understood. An unknown rule would otherwise silently
    // become an ordinary day on that day's fallback practice.
    if (d.pick !== undefined && d.pick !== "best") return null;

    const day: JourneyDay = {
      slug: d.slug,
      title: d.title,
      teaches: d.teaches,
      ...(minutes !== null ? { minutes } : { cycles: cycles as number }),
    };
    if (d.pick === "best") day.pick = "best";
    out.push(day);
  }
  return out;
}

/** Null for a row whose days are unusable, so one bad row hides itself instead of breaking the tab. */
export function journeyFromRow(row: Pick<JourneyRow, JourneyColumns>): Journey | null {
  const days = parseDays(row.days);
  if (!days) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    about: row.about,
    days,
  };
}

export function progressFromRow(row: Pick<ProgressRow, ProgressColumns> | null): JourneyProgress {
  if (!row) return NO_PROGRESS;
  return {
    daysCompleted: row.days_completed,
    startedOn: row.started_on,
    lastDayOn: row.last_day_on,
    completed: row.completed_at !== null,
  };
}

/**
 * The practice a `pick: "best"` day should be.
 *
 * "Best" is the highest average of how you felt afterwards, which is the
 * question the check-in actually asks. Ties go to the one you have done more
 * often, because two good evenings is weaker evidence than five.
 *
 * Matched by name, which is what the check-ins are grouped by. A routine's
 * name matches no practice and so drops out on its own, and a practice of your
 * own that rates best is a legitimate answer -- the day is about your evidence,
 * not our catalogue. A gated practice is never the answer: a course must not
 * drop anyone into Kapalabhati, which is exactly what its confirmation exists
 * to prevent.
 */
export function bestRated(shifts: CalmShift[], patterns: Pattern[]): Pattern | null {
  const byName = new Map(patterns.map((p) => [p.name, p]));
  const ranked = shifts
    .map((s) => ({ shift: s, pattern: byName.get(s.patternName) }))
    .filter((r): r is { shift: CalmShift; pattern: Pattern } => r.pattern !== undefined)
    .filter((r) => !needsConfirming(r.pattern.phases))
    .sort(
      (a, b) =>
        b.shift.averageAfter - a.shift.averageAfter || b.shift.practices - a.shift.practices,
    );
  return ranked[0]?.pattern ?? null;
}

/**
 * The course against the practices this person actually has, and where they
 * are up to.
 *
 * Returns null when any day names a practice that is not there, for the same
 * reason a routine does: a course missing its third day is not the course.
 *
 * `today` is the day that can be started now. It is null once the whole course
 * is done, and null on a day whose practice has already been counted -- the
 * one-a-day rule, which is the difference between a seven-day course and a
 * list you could get through in half an hour.
 */
export function resolveJourney({
  journey,
  patterns,
  progress,
  today,
  shifts = [],
}: {
  journey: Journey;
  patterns: Pattern[];
  progress: JourneyProgress;
  /** The local date where the user is. */
  today: string;
  /** Their check-ins, for a `pick: "best"` day. */
  shifts?: CalmShift[];
}): ResolvedJourney | null {
  const best = journey.days.some((d) => d.pick === "best") ? bestRated(shifts, patterns) : null;
  const openToday = progress.lastDayOn === null || progress.lastDayOn < today;
  const next = progress.daysCompleted + 1;

  const days: ResolvedDay[] = [];
  for (const [i, day] of journey.days.entries()) {
    const number = i + 1;
    const chosen = day.pick === "best" ? best : null;
    const pattern =
      chosen ?? patterns.find((p) => p.kind === "builtin" && p.slug === day.slug);
    if (!pattern) return null;

    const cycle = buildCycle(pattern.phases);
    const cycles =
      day.minutes !== undefined
        ? cyclesForMinutes(cycle, day.minutes, pattern.maxCycles)
        : Math.max(1, Math.min(day.cycles as number, pattern.maxCycles ?? Infinity));

    // Labelled in the unit the day was written in, for the same reason a
    // routine step is: a day asked for as "6 breaths" should not read as a
    // number of seconds just because that practice has no cap.
    const breaths = cycles * cycle.breaths;
    const label =
      day.cycles !== undefined
        ? `${breaths} ${breaths === 1 ? "breath" : "breaths"}`
        : lengthLabel(cycle, cycles, pattern.maxCycles);

    const state: DayState =
      number <= progress.daysCompleted
        ? "done"
        : number === next
          ? openToday
            ? "today"
            : "tomorrow"
          : "ahead";

    days.push({
      day,
      number,
      pattern,
      cycle,
      cycles,
      seconds: cycle.seconds * cycles,
      label,
      state,
      chosenBecause: chosen ? `Your check-ins rate ${chosen.name} highest.` : null,
    });
  }

  return {
    journey,
    days,
    progress,
    today: days.find((d) => d.state === "today") ?? null,
  };
}

/** "Day 3 of 7", for a card. */
export const dayLine = (done: number, total: number) =>
  done === 0 ? `${total} days` : done >= total ? "Finished" : `Day ${done} of ${total} done`;

/** A journey lives under /breathe/journey/, so its slug cannot collide with a practice. */
export const journeyHref = (slug: string, basePath = "/breathe") => `${basePath}/journey/${slug}`;
