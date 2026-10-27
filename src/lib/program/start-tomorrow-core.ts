/**
 * startTomorrowCore: shift a brand-new plan's anchor by one day.
 * 
 * Makes tomorrow day 1 by updating the program's started_on and ends_on dates.
 * Only allowed for a brand-new plan (block 1) before its first session is started.
 * Idempotent: two calls shift only one day.
 */

import { addDays } from "@/lib/dates";

type Program = {
  id: string;
  block_number: number;
  started_on: string;
  ends_on: string;
};

type Session = {
  id: string;
  status: string;
};

export type StartTomorrowDeps = {
  /** Get the active program for the user */
  getActiveProgram: () => Promise<Program | null>;
  /** Get sessions that have been started */
  getStartedSessions: () => Promise<Session[]>;
  /** Update the program dates */
  updateProgramDates: (programId: string, started_on: string, ends_on: string) => Promise<void>;
  /** Tomorrow's date as YYYY-MM-DD */
  tomorrow: string;
};

export type StartTomorrowResult =
  | { ok: true }
  | { ok: false; error: string };

export async function startTomorrowCore(
  deps: StartTomorrowDeps
): Promise<StartTomorrowResult> {
  const program = await deps.getActiveProgram();
  
  if (!program) {
    return { ok: false, error: "No active program" };
  }

  // Only allowed for brand-new plans (block 1)
  if (program.block_number !== 1) {
    return { ok: false, error: "Only allowed for new plans" };
  }

  // Check if any session has been started
  const sessions = await deps.getStartedSessions();
  if (sessions.length > 0) {
    return { ok: false, error: "Plan already started" };
  }

  // Idempotent: check if already shifted (tomorrow is the anchor)
  if (program.started_on === deps.tomorrow) {
    return { ok: true };
  }

  // Shift the anchor by one day
  await deps.updateProgramDates(
    program.id,
    program.started_on,  // MUTANT: no shift
    program.ends_on       // MUTANT: no shift
  );

  return { ok: true };
}
