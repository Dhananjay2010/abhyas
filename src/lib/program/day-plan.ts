import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isoWeekday } from "@/lib/dates";
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

/**
 * The days the "swap the day" prompt can offer.
 *
 * Only the block's strength days, deduplicated by label: a four-day
 * upper/lower split has two days called "Upper", and offering both would ask
 * the user a question they cannot answer. Yoga, breathing and rest are added
 * by the prompt itself, since they need no program day.
 */
export async function plannableDays(
  supabase: Client,
  programId: string,
): Promise<PlannableDay[]> {
  const { data } = await supabase
    .from("program_days")
    .select("id, day_index, day_type, label")
    .eq("program_id", programId)
    .eq("status", "active")
    .order("day_index");

  const seen = new Set<string>();
  const out: PlannableDay[] = [];
  for (const d of data ?? []) {
    if (d.day_type !== "weights" && d.day_type !== "bodyweight") continue;
    const label = d.label ?? "Training";
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ programDayId: d.id, label, dayType: d.day_type });
  }
  return out;
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
  days: PlannableDay[];
};

/**
 * Everything the end-of-session prompt needs about tomorrow.
 *
 * Returns null when there is no active block, which is the one case where
 * asking "what about tomorrow?" has no answer to offer.
 *
 * @param targetLocalDate - If provided, resolves this date instead of wall-clock tomorrow.
 *                          Used to show the session's local_date + 1 even after midnight.
 */
export async function nextDayPlan(
  supabase: Client,
  timezone: string,
  targetLocalDate?: string,
): Promise<NextDayPlan | null> {
  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (!program) return null;

  const { sessionPlanTargetDate } = await import("@/lib/session/resolve-plan-target-date");
  const { localDateString } = await import("@/lib/dates");
  const tomorrow = targetLocalDate ?? sessionPlanTargetDate(localDateString(timezone));
  const [resolved, days] = await Promise.all([
    resolveDay(supabase, program.id, tomorrow),
    plannableDays(supabase, program.id),
  ]);

  return {
    localDate: tomorrow,
    plannedLabel: resolved?.label ?? "Rest",
    days,
  };
}
