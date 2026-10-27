import { addDays } from "@/lib/dates";

/**
 * Compute the target date for planning from a session's local_date.
 * 
 * Returns session.local_date + 1 day, so a session started at 23:50 IST
 * and finishing at 00:20 IST the next day always targets the session's
 * recorded day + 1, not the current wall-clock day.
 */
export function sessionPlanTargetDate(sessionLocalDate: string): string {
  return addDays(sessionLocalDate, 1);
}

/**
 * MED-4: the day the end-of-session prompt is about, given the session's
 * local_date and the user's local today (both computed on the server).
 *
 * session.local_date + 1 when that is today or later; otherwise (a stale
 * session finished 2+ days later) user-local today + 1, so the prompt never
 * offers a day that has already been and gone. The session page (display) and
 * the planDay action (write) both call this, so they always agree.
 */
export function planTargetDate(sessionLocalDate: string, userLocalToday: string): string {
  const candidate = sessionPlanTargetDate(sessionLocalDate);
  return candidate >= userLocalToday ? candidate : addDays(userLocalToday, 1);
}

export interface ResolvePlanTargetDateDeps {
  fetchSessionLocalDate(
    sessionId: string,
    userId: string
  ): Promise<{ localDate: string | null; error: string | null }>;
}

type Input = 
  | { userId: string; sessionId: string }
  | { userId: string; localDate: string };

type Result = { ok: true; data: string } | { ok: false; error: string };

/**
 * MED-A + MED-4: Resolve the target date for planning.
 * 
 * When sessionId is provided:
 * - Fetch session.local_date
 * - Compute candidate = session.local_date + 1
 * - If candidate >= user-local today, use candidate
 * - Otherwise (session is old), fall back to user-local today + 1
 * - This ensures the prompt NEVER offers a past day
 * 
 * Examples:
 * - Session on 23 Oct finished same day → targets 24 Oct
 * - Session started 23 Oct, finished 24 Oct 00:30 → still targets 24 Oct
 * - Session started 23 Oct, finished 26 Oct → targets 27 Oct (today + 1)
 */
export async function resolvePlanTargetDate(
  deps: ResolvePlanTargetDateDeps,
  input: Input,
  userLocalToday: string,
): Promise<Result> {
  if ("sessionId" in input) {
    const result = await deps.fetchSessionLocalDate(input.sessionId, input.userId);
    if (result.error) {
      return { ok: false, error: "Could not load session." };
    }
    if (!result.localDate) {
      return { ok: false, error: "Session not found." };
    }

    // MED-4: session.local_date + 1, but never a past day
    return { ok: true, data: planTargetDate(result.localDate, userLocalToday) };
  }

  return { ok: true, data: input.localDate };
}
