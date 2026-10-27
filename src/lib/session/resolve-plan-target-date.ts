import { addDays } from "@/lib/dates";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

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

export interface ResolvePlanTargetDateDeps {
  fetchSessionLocalDate(
    sessionId: string,
    userId: string
  ): Promise<{ localDate: string | null; error: string | null }>;
}

/**
 * Resolve the target date for planning.
 *
 * When sessionId is provided, reads the session's local_date from the DB
 * (scoped to userId) and returns local_date + 1 day. This ensures that a
 * session starting at 23:50 IST and finishing at 00:20 IST targets D+1
 * from the session's stored local_date, not from the current time.
 *
 * When localDate is provided directly (Today page), returns it unchanged.
 */
export async function resolvePlanTargetDate(
  deps: ResolvePlanTargetDateDeps,
  input: {
    userId: string;
    sessionId?: string;
    localDate?: string;
  }
): Promise<Result<string>> {
  if (input.sessionId) {
    const result = await deps.fetchSessionLocalDate(input.sessionId, input.userId);
    if (result.error) {
      return { ok: false, error: "Could not load session." };
    }
    if (!result.localDate) {
      return { ok: false, error: "Session not found." };
    }
    const targetDate = sessionPlanTargetDate(result.localDate);
    return { ok: true, data: targetDate };
  }

  if (input.localDate) {
    return { ok: true, data: input.localDate };
  }

  return { ok: false, error: "Either sessionId or localDate is required." };
}
