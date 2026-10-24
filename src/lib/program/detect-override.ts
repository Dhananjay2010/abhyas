/**
 * Detect whether a session represents an intentional override vs normal schedule.
 *
 * After a rebuild, sessions are repointed to the new block's matching days.
 * This helper distinguishes:
 * - Normal schedule: user followed the block's plan (or a repointed session)
 * - Override: user chose a different type (rest→training) or different weekday
 */

import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

/**
 * Check if a session overrides the scheduled day.
 *
 * @param override - The session that might be an override (or undefined if no session)
 * @param overrideDay - The program day the override session points to (or undefined)
 * @param scheduled - The program day scheduled for today's weekday in the active block
 * @param todayWeekday - Today's weekday (1-7, Monday=1)
 * @returns true if the override differs from what the block scheduled
 */
export function isSessionOverride(
  override:
    | {
        actual_type: DayType | null;
      }
    | undefined,
  overrideDay:
    | {
        id: string;
        day_index: number;
        day_type: DayType;
      }
    | undefined,
  scheduled:
    | {
        id: string;
        day_index: number;
        day_type: DayType;
      }
    | undefined,
  todayWeekday: number,
): boolean {
  // No override session = not an override
  if (!override) return false;

  const scheduledType = scheduled?.day_type ?? null;

  // Type override: user chose rest/yoga when block said training, or vice versa
  if (override.actual_type !== scheduledType) return true;

  // If the override's day isn't found (shouldn't happen after repoint, but be safe)
  if (!overrideDay) return false;

  // Weekday override: session points to a day whose day_index doesn't match today.
  // Example: user chose Upper (Monday, day_index=1) on a Tuesday (todayWeekday=2).
  // After repoint, the session's program_day_id was updated to the new block's
  // Upper day, but if that Upper is still day_index=1, this is still an override.
  if (overrideDay.day_index !== todayWeekday) return true;

  // Normal: the session's day matches today's weekday and type
  return false;
}
