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

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * QA1 LOW-2: how the end-of-session prompt names its target day. A session
 * finished the next morning plans *today* (see `planTargetDate`), so calling
 * it "Tomorrow" would describe the wrong day. "Today", "Tomorrow", or else
 * the weekday ("Thursday").
 */
export function planTargetLabel(targetDate: string, userLocalToday: string): string {
  if (targetDate === userLocalToday) return "Today";
  if (targetDate === addDays(userLocalToday, 1)) return "Tomorrow";
  return WEEKDAYS[new Date(`${targetDate}T00:00:00Z`).getUTCDay()];
}

/** The prompt's heading for a label from `planTargetLabel`. */
export function planPromptHeading(label: string): string {
  const named = label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label;
  return `What about ${named}?`;
}

/**
 * QA3 LOW-1: copy returned when the day the summary showed can no longer be
 * saved (the page sat open across midnight). The action sends back the new
 * day so the prompt can show it before anything is saved.
 */
export const DAY_CHANGED_ERROR = "The day has changed since this was shown. Check the new day and choose again.";

/**
 * QA3 LOW-1: may the end-of-session prompt save the day it showed?
 * Only if that day is still today or tomorrow (user-local) and comes after
 * the session's own day. That is the set of days the MED-4 rule can show for
 * this session (local_date + 1, or today + 1 for a stale session) that are
 * not yet past; a page left open across midnight keeps the date it showed
 * instead of having the rule re-run at tap time.
 *
 * QA3 LOW-1 (#166 r5): the day the rule gives right now is also accepted.
 * After a profile timezone moves west the session's day can be after
 * user-local today, so that day is neither today nor tomorrow; refusing it
 * sent back the same day as the retarget and the prompt never saved. When
 * the session's day is not after today, that day is already today or
 * tomorrow, so nothing else changes.
 */
export function acceptShownTargetDate(
  shownDate: string,
  sessionLocalDate: string,
  userLocalToday: string,
): boolean {
  if (shownDate === planTargetDate(sessionLocalDate, userLocalToday)) return true;
  const todayOrTomorrow = shownDate === userLocalToday || shownDate === addDays(userLocalToday, 1);
  return todayOrTomorrow && shownDate > sessionLocalDate;
}

export interface ResolvePlanTargetDateDeps {
  fetchSessionLocalDate(
    sessionId: string,
    userId: string
  ): Promise<{ localDate: string | null; error: string | null }>;
}

type Input = 
  | { userId: string; sessionId: string; shownDate?: string }
  | { userId: string; localDate: string };

type Result =
  | { ok: true; data: string }
  | { ok: false; error: string; retarget?: string };

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
    const target = planTargetDate(result.localDate, userLocalToday);
    // QA3 LOW-1: save the day the prompt showed while it is still valid;
    // otherwise send back the day the rule gives now, unsaved.
    if (input.shownDate !== undefined) {
      if (acceptShownTargetDate(input.shownDate, result.localDate, userLocalToday)) {
        return { ok: true, data: input.shownDate };
      }
      return { ok: false, error: DAY_CHANGED_ERROR, retarget: target };
    }
    return { ok: true, data: target };
  }

  return { ok: true, data: input.localDate };
}
