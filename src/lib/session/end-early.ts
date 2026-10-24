import { isNetworkError } from "./network-error";

/**
 * Outcome of attempting to end a session early.
 */
export type EndEarlyOutcome = "navigate_today" | "show_summary" | "show_offline" | "show_error";

/**
 * Outcome of attempting to finish a session normally.
 */
export type FinishOutcome =
  | { action: "navigate_today" }
  | { action: "show_summary" }
  | { action: "show_offline_error" }
  | { action: "show_error" };

/**
 * Determine what to do after attempting to abandon a session.
 *
 * @param result - The result from abandonSession: {ok:true}, {ok:false,error?}, or {thrown:unknown}
 * @param setsDone - Number of sets logged
 * @returns The outcome action to take
 */
export function endEarlyOutcome(
  result: { ok: true } | { ok: false; error?: string } | { thrown: unknown },
  setsDone: number,
): EndEarlyOutcome {
  // Error cases
  if ("thrown" in result) {
    return isNetworkError(result.thrown) ? "show_offline" : "show_error";
  }
  if ("ok" in result && !result.ok) {
    return "show_error";
  }

  // Success cases
  return setsDone === 0 ? "navigate_today" : "show_summary";
}

/**
 * Determine what to do after attempting to finish a session normally.
 *
 * @param result - The result from finishSession: {ok:true, data}, {ok:false}, or {thrown:unknown}
 * @returns The outcome action to take
 */
export function finishOutcome(
  result:
    | { ok: true; data: { status: "completed" | "skipped" } }
    | { ok: false; error?: string }
    | { thrown: unknown },
): FinishOutcome {
  // Error cases
  if ("thrown" in result) {
    return isNetworkError(result.thrown)
      ? { action: "show_offline_error" }
      : { action: "show_error" };
  }
  if ("ok" in result && !result.ok) {
    return { action: "show_error" };
  }

  // Success: navigate if skipped, otherwise show summary
  return result.data.status === "skipped"
    ? { action: "navigate_today" }
    : { action: "show_summary" };
}
