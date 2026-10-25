/**
 * Identify program_days that were pulled forward onto earlier rest days
 * in the same cycle week and completed or started.
 *
 * These days should not be offered again, should not trigger "missed", and
 * their original weekdays become rest with a special label.
 */

import { isoWeekday, DAY_NAMES } from "@/lib/dates";
import { cycleWeekFor } from "@/lib/program/block-range";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

export interface ProgramDay {
  id: string;
  day_index: number;
  day_type: DayType;
  label: string | null;
}

export interface Session {
  local_date: string;
  status: string;
  actual_type: DayType | null;
  program_day_id: string | null;
  started_at: string | null;
}

export interface PulledForwardInfo {
  programDayId: string;
  originalDayIndex: number;
  originalLabel: string | null;
  pulledToDayIndex: number;
  pulledToDate: string;
}

export interface PulledForwardInput {
  program: {
    started_on: string;
    week_offset: number;
  };
  days: ProgramDay[];
  sessions: Session[];
  localToday: string;
}

/**
 * Check if a session type owns planned workouts (weights or bodyweight).
 */
function ownsPlannedWorkout(sessionType: DayType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight";
}

/**
 * Find all program_days that were pulled forward onto earlier rest days
 * in the same cycle week and completed or in_progress.
 *
 * Returns a map from program_day_id to details about the pull-forward.
 */
export function pulledForwardDays(input: PulledForwardInput): Map<string, PulledForwardInfo> {
  const { program, days, sessions, localToday } = input;
  const result = new Map<string, PulledForwardInfo>();
  
  const todayCycleWeek = cycleWeekFor(program, localToday);
  
  // For each strength day in the template
  for (const day of days) {
    if (day.day_type === "rest") continue;
    
    // Find if this program_day was completed/in-progress earlier this week on a rest day
    for (const sess of sessions) {
      if (
        sess.program_day_id === day.id &&
        sess.local_date <= localToday &&
        (sess.status === "completed" || sess.status === "in_progress") &&
        ownsPlannedWorkout(sess.actual_type)
      ) {
        // Check if session is in the same cycle week
        const sessCycleWeek = cycleWeekFor(program, sess.local_date);
        
        if (sessCycleWeek === todayCycleWeek) {
          // Check if the session was done on a rest day (pulled forward from template)
          const sessionDayIndex = isoWeekday(sess.local_date);
          const templateDayAtSession = days.find((d) => d.day_index === sessionDayIndex);
          
          if (templateDayAtSession && templateDayAtSession.day_type === "rest") {
            // This program_day was pulled forward onto a rest day
            result.set(day.id, {
              programDayId: day.id,
              originalDayIndex: day.day_index,
              originalLabel: day.label,
              pulledToDayIndex: sessionDayIndex,
              pulledToDate: sess.local_date,
            });
            break; // Only track the first (earliest) pull-forward
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Get the "Done Monday (your choice)" label for a pulled-forward day.
 */
export function pulledForwardLabel(info: PulledForwardInfo): string {
  const dayName = DAY_NAMES[info.pulledToDayIndex - 1]; // day_index is 1-7, DAY_NAMES is 0-6
  return `Done ${dayName} (your choice)`;
}

/**
 * Get the "You already did Push A on Monday (your choice)." message for Today.
 */
export function pulledForwardMessage(info: PulledForwardInfo): string {
  const dayName = DAY_NAMES[info.pulledToDayIndex - 1]; // day_index is 1-7, DAY_NAMES is 0-6
  const label = info.originalLabel ?? "training";
  return `You already did ${label} on ${dayName} (your choice).`;
}
