/**
 * Guard against query load failures in Today page data.
 *
 * When allSessionsRes fails to load, we cannot determine whether the user
 * has started any sessions. This helper returns null to indicate unknown state,
 * which suppresses first-session offers and missed-day prompts.
 */

import { hasStartedAnySession, type HasStartedInput } from "./has-started-any";

export type QueryResult<T> = { data: T | null; error: unknown };

/**
 * Determine hasStartedAny from allSessionsRes, handling load failures.
 * 
 * Returns:
 * - boolean: user definitely has/hasn't started (query succeeded)
 * - null: unknown state (query failed)
 */
export function hasStartedAnyOrNull(
  allSessionsRes: QueryResult<HasStartedInput["sessions"]>
): boolean | null {
  if (allSessionsRes.error) {
    return null; // Unknown state - query failed
  }
  return hasStartedAnySession({ sessions: allSessionsRes.data ?? [] });
}
