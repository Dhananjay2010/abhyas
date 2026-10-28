import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import type { PlannableDay } from "@/app/session/actions";

type Client = SupabaseClient<Database>;
type DayType = Database["public"]["Enums"]["day_type"];

/** What a given date actually is, once any one-day override is taken into account. */
export type ResolvedDay = {
  localDate: string;
  dayType: DayType;
  label: string;
  /** The program day whose exercises apply, or null for rest, yoga or breathing. */
  programDayId: string | null;
  /** True when this came from a "what about tomorrow?" choice, not the block. */
  isOverride: boolean;
};

/** How a day reads when it is not one of the block's own training days. */
const OVERRIDE_LABEL: Partial<Record<DayType, string>> = {
  rest: "Rest",
  yoga: "Yoga",
  meditation: "Breathing",
  active_recovery: "Active recovery",
};

export function labelForDayType(dayType: DayType, fallback: string | null): string {
  return OVERRIDE_LABEL[dayType] ?? fallback ?? "Today";
}

// ────────────────────────────────────────────────────────────────────────────
// resolveTodayProgramDay: core + wrapper (for mutant viii)
// ────────────────────────────────────────────────────────────────────────────

type ProgramDayForResolve = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  label: string | null;
};

export type ResolveTodayCoreDeps = {
  getAllProgramDays: () => Promise<ProgramDayForResolve[]>;
  getYesterdaySession: () => Promise<{
    programDayId: string | null;
    actualType: string;
  } | null>;
  getTodayIndex: () => number;
  getYesterdayIndex: () => number;
};

export function resolveTodayProgramDayCore(
  deps: ResolveTodayCoreDeps
): Promise<{ programDayId: string; dayType: Database["public"]["Enums"]["day_type"]; label: string | null } | null> {
  return (async () => {
    const todayIndex = deps.getTodayIndex();
    const yesterdayIndex = deps.getYesterdayIndex();

    const [days, yesterdaySession] = await Promise.all([
      deps.getAllProgramDays(),
      deps.getYesterdaySession(),
    ]);

    const scheduledToday = days.find((d) => d.day_index === todayIndex);

    if (!scheduledToday) return null;

    if (!yesterdaySession) {
      return {
        programDayId: scheduledToday.id,
        dayType: scheduledToday.day_type,
        label: scheduledToday.label,
      };
    }

    const scheduledYesterday = days.find((d) => d.day_index === yesterdayIndex);
    const yesterdayWasSwap = wasSwapDay({
      completedProgramDayId: yesterdaySession.programDayId,
      scheduledProgramDayId: scheduledYesterday?.id ?? null,
      completedActualType: yesterdaySession.actualType,
    });

    // MED-1 fix: Compare by label (not id) to detect collision in splits
    // where a template repeats (Upper×2 in 4-day, PPL×2 in 6-day).
    // If yesterday was a swap AND today's scheduled label matches what was done,
    // that's a collision even if the program_day ids differ.
    if (yesterdayWasSwap) {
      const yesterdayDay = days.find((d) => d.id === yesterdaySession.programDayId);
      const yesterdayLabel = yesterdayDay?.label ?? "";
      const todayLabel = scheduledToday.label ?? "";

      if (yesterdayLabel && yesterdayLabel === todayLabel) {
        const rotation = days.filter(
          (d) => d.day_type === "weights" || d.day_type === "bodyweight"
        );

        const resolved = resolveTomorrowAfterSwap({
          todayWasSwap: yesterdayWasSwap,
          doneProgramDayId: yesterdaySession.programDayId,
          scheduledTomorrow: {
            programDayId: scheduledToday.id,
            label: scheduledToday.label ?? "",
          },
          rotation,
        });

        if (resolved) {
          const resolvedDay = days.find((d) => d.id === resolved.programDayId);
          if (resolvedDay) {
            return {
              programDayId: resolvedDay.id,
              dayType: resolvedDay.day_type,
              label: resolvedDay.label,
            };
          }
        }
      }
    }

    return {
      programDayId: scheduledToday.id,
      dayType: scheduledToday.day_type,
      label: scheduledToday.label,
    };
  })();
}

/**
 * Resolve today's program day, applying post-swap collision resolution.
 * 
 * Used by both Today page display AND start-session to ensure they agree.
 */
export async function resolveTodayProgramDay({
  supabase,
  programId,
  localToday,
  userId,
}: {
  supabase: Client;
  programId: string;
  localToday: string;
  userId: string;
}): Promise<{ programDayId: string; dayType: Database["public"]["Enums"]["day_type"]; label: string | null } | null> {
  const todayIndex = isoWeekday(localToday);
  const yesterday = addDays(localToday, -1);
  const yesterdayIndex = isoWeekday(yesterday);

  const deps: ResolveTodayCoreDeps = {
    async getAllProgramDays() {
      const { data } = await supabase
        .from("program_days")
        .select("id, day_index, day_type, label")
        .eq("program_id", programId)
        .eq("status", "active")
        .order("day_index");
      return data ?? [];
    },

    async getYesterdaySession() {
      const { data } = await supabase
        .from("sessions")
        .select("program_day_id, actual_type")
        .eq("user_id", userId)
        .eq("local_date", yesterday)
        .eq("status", "completed")
        .in("actual_type", ["weights", "bodyweight"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data
        ? {
            programDayId: data.program_day_id,
            actualType: data.actual_type ?? "",
          }
        : null;
    },

    getTodayIndex: () => todayIndex,
    getYesterdayIndex: () => yesterdayIndex,
  };

  return await resolveTodayProgramDayCore(deps);
}

/**
 * The days the "swap the day" prompt can offer.
 *
 * Only the block's strength days, deduplicated by label: a four-day
 * upper/lower split has two days called "Upper", and offering both would ask
 * the user a question they cannot answer. Yoga, breathing and rest are added
 * by the prompt itself, since they need no program day.
 * 
 * Marks the "next up" workout based on the most recently completed session,
 * so rest-day swaps can preselect the recommended next workout in the rotation.
 */
export async function plannableDays(
  supabase: Client,
  programId: string,
  options?: {
    /** When provided, marks the next workout in rotation after this date's session */
    afterDate?: string;
    /** User ID for filtering sessions (required when afterDate is provided) */
    userId?: string;
  }
): Promise<PlannableDay[]> {
  const { data } = await supabase
    .from("program_days")
    .select("id, day_index, day_type, label")
    .eq("program_id", programId)
    .eq("status", "active")
    .order("day_index");

  const trainingDays = (data ?? []).filter(
    d => d.day_type === "weights" || d.day_type === "bodyweight"
  );
  
  // Find which workout is "next up" based on the most recently completed session
  // MED-1 fix: Track by label (not id) so the badge lands on the kept row
  // after deduplication. In 4-day Upper/Lower, the nextUp might be "Upper" (id U2),
  // but deduplication keeps the first "Upper" (id U1), so we mark by label.
  let nextUpLabel: string | null = null;
  
  if (options?.afterDate && options?.userId && trainingDays.length > 0) {
    const { data } = await supabase
      .from("sessions")
      .select("program_day_id")
      .eq("user_id", options.userId)
      .eq("status", "completed")
      .in("actual_type", ["weights", "bodyweight"])
      .lte("local_date", options.afterDate)
      .order("local_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const recentSession = data;
    
    if (recentSession?.program_day_id) {
      const completedIndex = trainingDays.findIndex(d => d.id === recentSession.program_day_id);
      if (completedIndex >= 0) {
        // Next workout in rotation (wraps around)
        const nextDay = trainingDays[(completedIndex + 1) % trainingDays.length];
        nextUpLabel = nextDay.label ?? null;
      }
    } else {
      // No completed sessions yet: next up is the first day in the rotation
      nextUpLabel = trainingDays[0]?.label ?? null;
    }
  }

  const seen = new Set<string>();
  const out: PlannableDay[] = [];
  for (const d of trainingDays) {
    const label = d.label ?? "Training";
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ 
      programDayId: d.id, 
      label, 
      dayType: d.day_type,
      nextUp: label === nextUpLabel
    });
  }
  return out;
}

type ProgramDay = {
  id: string;
  label: string | null;
  day_type: string;
  day_index: number;
};

function isDayType(value: string): value is DayType {
  return ["weights", "bodyweight", "yoga", "meditation", "rest", "active_recovery"].includes(value);
}

/**
 * Resolve tomorrow's workout after a rest-day swap collision.
 * 
 * When today was a swap AND tomorrow's scheduled workout equals what was just done,
 * serve the next in rotation to avoid back-to-back repeats.
 * 
 * MED-1 fix: Compare by label (not id) to handle splits where a template
 * repeats (Upper×2 in 4-day, PPL×2 in 6-day). The collision check must
 * recognize that swapping to "Upper" and having "Upper" scheduled tomorrow
 * is the same template, even if their program_day ids differ.
 */
export function resolveTomorrowAfterSwap({
  todayWasSwap,
  doneProgramDayId,
  scheduledTomorrow,
  rotation,
}: {
  /** True if today's completed session was a swap (different from scheduled) */
  todayWasSwap: boolean;
  /** The program_day_id that was completed today */
  doneProgramDayId: string | null;
  /** Tomorrow's resolved program day (what the schedule says) */
  scheduledTomorrow: { programDayId: string; label: string } | null;
  /** All training days in the rotation, sorted by day_index */
  rotation: ProgramDay[];
}): { programDayId: string; label: string; dayType: DayType } | null {
  // No collision if not a swap
  if (!todayWasSwap) return null;
  
  // No collision if tomorrow is Rest or no scheduled day
  if (!scheduledTomorrow) return null;
  
  // Find the done day in rotation to get its label
  const doneDay = rotation.find(d => d.id === doneProgramDayId);
  if (!doneDay) return null;
  
  const doneLabel = doneDay.label ?? "";
  const tomorrowLabel = scheduledTomorrow.label ?? "";
  
  // No collision if tomorrow's label is different from what was done today
  if (doneLabel !== tomorrowLabel) return null;
  
  // Collision detected: find next in rotation
  const currentIndex = rotation.findIndex(d => d.id === doneProgramDayId);
  if (currentIndex < 0) return null;
  
  const nextIndex = (currentIndex + 1) % rotation.length;
  const nextDay = rotation[nextIndex];
  
  if (!nextDay) return null;
  
  // Type guard with fallback: rotation is filtered to weights|bodyweight, but type system needs proof
  const dayType = isDayType(nextDay.day_type) ? nextDay.day_type : "weights";
  
  return {
    programDayId: nextDay.id,
    label: nextDay.label ?? scheduledTomorrow.label,
    dayType,
  };
}

/**
 * Determine if today was a swap day.
 * 
 * A swap occurs when:
 * - The completed session's program_day_id differs from the scheduled day, OR
 * - Today was scheduled Rest but a workout was done
 */
export function wasSwapDay({
  completedProgramDayId,
  scheduledProgramDayId,
  completedActualType,
}: {
  /** The program_day_id of the completed session */
  completedProgramDayId: string | null;
  /** The scheduled program_day_id for today (null for Rest days) */
  scheduledProgramDayId: string | null;
  /** The actual_type of the completed session */
  completedActualType: string;
}): boolean {
  // Not a swap if no workout was completed
  if (!completedProgramDayId) return false;
  
  // Not a swap if not a strength workout
  if (completedActualType !== "weights" && completedActualType !== "bodyweight") {
    return false;
  }
  
  // Swap if scheduled Rest but did a workout
  if (scheduledProgramDayId === null) return true;
  
  // Swap if different program day
  return completedProgramDayId !== scheduledProgramDayId;
}

/**
 * What a date is, preferring a planned override over the block's weekday.
 *
 * The block is a weekly template keyed on weekday, and an override is a
 * planned `sessions` row for one date. Reading the override first is what
 * makes "rest tomorrow" and "swap the day" mean anything — without it the
 * choice would be written and then ignored.
 */
export async function resolveDay(
  supabase: Client,
  programId: string,
  localDate: string,
): Promise<ResolvedDay | null> {
  const [daysRes, overrideRes] = await Promise.all([
    supabase
      .from("program_days")
      .select("id, day_index, day_type, label")
      .eq("program_id", programId)
      .eq("status", "active"),
    // Planned or already under way: both mean "this is what the day is", and
    // only reading `planned` made a started override invisible to Today.
    supabase
      .from("sessions")
      .select("actual_type, program_day_id, status")
      .eq("local_date", localDate)
      .in("status", ["planned", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const days = daysRes.data ?? [];
  const scheduled = days.find((d) => d.day_index === isoWeekday(localDate));
  const override = overrideRes.data;

  if (override?.actual_type) {
    let day = override.program_day_id
      ? days.find((d) => d.id === override.program_day_id)
      : undefined;
    
    // If the override points to a superseded day (not in active days list),
    // try to resolve to the active day with the same day_index
    if (!day && override.program_day_id) {
      const { data: superseded } = await supabase
        .from("program_days")
        .select("day_index, label")
        .eq("id", override.program_day_id)
        .maybeSingle();
      
      if (superseded) {
        // Try to find active day with same day_index
        day = days.find((d) => d.day_index === superseded.day_index);
        // If no match, use the superseded label as fallback
        const label = day?.label ?? superseded.label;
        return {
          localDate,
          dayType: override.actual_type,
          label: labelForDayType(override.actual_type, label),
          programDayId: day?.id ?? override.program_day_id,
          isOverride: true,
        };
      }
    }
    
    return {
      localDate,
      dayType: override.actual_type,
      label: labelForDayType(override.actual_type, day?.label ?? null),
      programDayId: override.program_day_id,
      isOverride: true,
    };
  }

  if (!scheduled) return null;
  return {
    localDate,
    dayType: scheduled.day_type,
    label: labelForDayType(scheduled.day_type, scheduled.label),
    programDayId: scheduled.id,
    isOverride: false,
  };
}

export type NextDayPlan = {
  localDate: string;
  plannedLabel: string;
  /** The resolved program_day_id for tomorrow (null for Rest) */
  programDayId: string | null;
  dayType: DayType;
  days: PlannableDay[];
  collisionResolved: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// nextDayPlan: core + wrapper (for mutant vii)
// ────────────────────────────────────────────────────────────────────────────

type ProgramDayForCore = {
  id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
};

export type NextDayPlanCoreDeps = {
  getTodayCompletedSession: () => Promise<{
    programDayId: string | null;
    actualType: string;
  } | null>;
  getAllProgramDays: () => Promise<ProgramDayForCore[]>;
  getResolvedTomorrow: () => Promise<ResolvedDay | null>;
  getPlannableDays: () => Promise<PlannableDay[]>;
  getTodayDayIndex: () => number;
  getToday: () => string;
  getTomorrow: () => string;
};

export async function nextDayPlanCore(
  deps: NextDayPlanCoreDeps
): Promise<NextDayPlan | null> {
  const tomorrow = deps.getTomorrow();
  const todayDayIndex = deps.getTodayDayIndex();

  const [todaySession, allProgramDays, resolved, days] = await Promise.all([
    deps.getTodayCompletedSession(),
    deps.getAllProgramDays(),
    deps.getResolvedTomorrow(),
    deps.getPlannableDays(),
  ]);

  const scheduledToday = allProgramDays.find((d) => d.day_index === todayDayIndex);

  const todayWasSwap = todaySession
    ? wasSwapDay({
        completedProgramDayId: todaySession.programDayId,
        scheduledProgramDayId: scheduledToday?.id ?? null,
        completedActualType: todaySession.actualType,
      })
    : false;

  const rotation = allProgramDays.filter(
    (d) => d.day_type === "weights" || d.day_type === "bodyweight"
  );

  const resolvedProgramDayId = resolved?.programDayId ?? null;

  const collision =
    todayWasSwap && resolvedProgramDayId
      ? resolveTomorrowAfterSwap({
          todayWasSwap: true,
          doneProgramDayId: todaySession?.programDayId ?? null,
          scheduledTomorrow: {
            programDayId: resolvedProgramDayId,
            label: resolved?.label ?? "",
          },
          rotation,
        })
      : null;

  if (collision) {
    return {
      localDate: tomorrow,
      plannedLabel: collision.label ?? "Unknown",
      programDayId: collision.programDayId,
      dayType: collision.dayType,
      days,
      collisionResolved: true,
    };
  }

  return {
    localDate: tomorrow,
    plannedLabel: resolved?.label ?? "Rest",
    programDayId: resolvedProgramDayId,
    dayType: resolved?.dayType ?? "rest",
    days,
    collisionResolved: false,
  };
}

/**
 * Everything the end-of-session prompt needs about tomorrow.
 *
 * Returns null when there is no active block, which is the one case where
 * asking "what about tomorrow?" has no answer to offer.
 * 
 * Post-swap collision handling: if today's completed session was a swap AND
 * tomorrow's scheduled workout is the same program day just done, serve the
 * next workout in the rotation instead.
 * 
 * MED-1 fix: when targetLocalDate is provided (precomputed as session.local_date + 1),
 * use it as tomorrow. This ensures a session finishing after midnight still plans
 * the correct next day. Pass sessionId to query the specific session by id.
 * Pass now to pin the wall-clock for testing.
 * 
 * Signature matches PR #166 for trivial merge.
 */
export async function nextDayPlan(
  supabase: Client,
  timezone: string,
  targetLocalDate?: string,
  options?: { sessionId?: string; now?: Date },
): Promise<NextDayPlan | null> {
  const { data: program } = await supabase
    .from("programs")
    .select("id, user_id, split_type")
    .eq("status", "active")
    .maybeSingle();
  if (!program) return null;

  // MED-1: when targetLocalDate is provided (session summary), use it as tomorrow.
  // Otherwise compute tomorrow from wall-clock today (Today page).
  // Pin clock via options.now for testing.
  const wallClockNow = options?.now ?? new Date();
  const today = targetLocalDate ? addDays(targetLocalDate, -1) : localDateString(timezone, wallClockNow);
  const tomorrow = targetLocalDate ?? addDays(today, 1);
  const userId = program.user_id;
  const todayDayIndex = isoWeekday(today);

  const deps: NextDayPlanCoreDeps = {
    async getTodayCompletedSession() {
      // MED-1: check both completed and in_progress sessions. When computing the
      // prompt during a session (before finish), the session is in_progress but
      // will be completed by the time the user acts on the prompt. Treating it as
      // "today's session" prevents planning a repeat after a rest-day swap.
      // When sessionId is provided, query by id. Otherwise use newest on date.
      if (options?.sessionId) {
        const { data } = await supabase
          .from("sessions")
          .select("id, program_day_id, actual_type, local_date")
          .eq("id", options.sessionId)
          .eq("user_id", userId)
          .in("status", ["completed", "in_progress"])
          .in("actual_type", ["weights", "bodyweight"])
          .maybeSingle();
        return data
          ? { programDayId: data.program_day_id, actualType: data.actual_type ?? "" }
          : null;
      }
      
      const { data } = await supabase
        .from("sessions")
        .select("id, program_day_id, actual_type")
        .eq("user_id", userId)
        .eq("local_date", today)
        .in("status", ["completed", "in_progress"])
        .in("actual_type", ["weights", "bodyweight"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data
        ? { programDayId: data.program_day_id, actualType: data.actual_type ?? "" }
        : null;
    },

    async getAllProgramDays() {
      const { data } = await supabase
        .from("program_days")
        .select("id, label, day_index, day_type")
        .eq("program_id", program.id)
        .eq("status", "active")
        .order("day_index");
      return data ?? [];
    },

    async getResolvedTomorrow() {
      return await resolveDay(supabase, program.id, tomorrow);
    },

    async getPlannableDays() {
      return await plannableDays(supabase, program.id, {
        afterDate: today,
        userId,
      });
    },

    getTodayDayIndex: () => todayDayIndex,
    getToday: () => today,
    getTomorrow: () => tomorrow,
  };

  return await nextDayPlanCore(deps);
}
