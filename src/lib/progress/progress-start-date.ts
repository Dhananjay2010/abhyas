/**
 * Compute the start date for Progress day records.
 * 
 * Fix pd-b: Start from the EARLIER of the first non-superseded block's started_on
 * and the first completed session's local_date, so completed sessions always count
 * toward Days trained even if a block was incorrectly marked superseded.
 * 
 * Only considers sessions that pass countsTowardStreak (completed strength with
 * working sets, or completed yoga), so skipped, breathing, or rest sessions never
 * move the start earlier.
 */

import type { Database } from "@/lib/database.types";
import { countsTowardStreak } from "./training-days";

type SessionType = Database["public"]["Enums"]["day_type"];

export function progressStartDate(input: {
  programs: Array<{ startedOn: string }>;
  completedSessions: Array<{
    local_date: string;
    actual_type: SessionType | null;
    status: string;
    working_set_count?: number;
  }>;
}): string | null {
  const { programs, completedSessions } = input;

  // Filter to sessions that count toward streaks/days trained
  const qualifyingSessions = completedSessions.filter((s) =>
    countsTowardStreak(s.actual_type, s.status, s.working_set_count)
  );

  const firstSessionDate = qualifyingSessions.length > 0
    ? qualifyingSessions.reduce((earliest, s) => 
        s.local_date < earliest ? s.local_date : earliest, 
        qualifyingSessions[0].local_date
      )
    : null;

  const firstBlockDate = programs.length > 0 ? programs[0].startedOn : null;

  if (!firstSessionDate && !firstBlockDate) return null;
  if (!firstSessionDate) return firstBlockDate;
  if (!firstBlockDate) return firstSessionDate;
  
  return firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate;
}
