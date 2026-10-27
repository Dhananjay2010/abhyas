import type { Database } from "@/lib/database.types";
import { addDays } from "@/lib/dates";
import { planDayCore, type PlanDayClient } from "@/lib/session/plan-day-core";

type DayPlan =
  | { kind: "keep" }
  | { kind: "training"; programDayId: string }
  | { kind: "yoga" }
  | { kind: "breathing" }
  | { kind: "rest" };

type Result = { ok: true } | { ok: false; error: string };

export interface PlanDayFromSessionDeps {
  readSession(sessionId: string): Promise<{
    session: { local_date: string; user_id: string } | null;
    error: string | null;
  }>;
}

/**
 * Plan tomorrow's session based on a finished session's date.
 *
 * Computes targetDate = session.local_date + 1 day server-side, so a session
 * that started at 23:50 and finished at 00:20 targets the right day even when
 * the clock has crossed midnight. Uses the stored local_date from the DB, not
 * 'now', and not a date computed at page load.
 */
export async function planDayFromSession(
  deps: PlanDayFromSessionDeps,
  client: PlanDayClient,
  input: {
    sessionId: string;
    plan: DayPlan;
    today: string;
  },
): Promise<Result> {
  const sessionResult = await deps.readSession(input.sessionId);
  if (sessionResult.error) {
    return { ok: false, error: "Could not load session." };
  }
  if (!sessionResult.session) {
    return { ok: false, error: "Session not found." };
  }

  const targetDate = addDays(sessionResult.session.local_date, 1);

  return planDayCore(client, {
    userId: sessionResult.session.user_id,
    localDate: targetDate,
    today: input.today,
    plan: input.plan,
  });
}
