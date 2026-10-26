/**
 * Wire logged sets into today exercise rows.
 *
 * FIX (c): Maps logged sets by order_index to populate row.loggedSets,
 * excluding warm-ups, formatted via formatLoggedSets.
 */

import { formatLoggedSets } from "@/lib/session/format-logged-sets";
import type { UnitsPreference } from "@/lib/units";
import type { Database } from "@/lib/database.types";
import type { TodayRow } from "./build-today-rows";

export type TodayRowWithLoggedSets = TodayRow;

export type LoggedSetsData = {
  order_index: number;
  metric: Database["public"]["Enums"]["exercise_metric"];
  session_sets: Array<{
    reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    is_warmup_set: boolean;
  }> | null;
};

/**
 * Wire logged sets into rows, extracting order_index from the real key format (s<N>).
 */
export function wireLoggedSets(
  rows: TodayRowWithLoggedSets[],
  loggedSetsData: LoggedSetsData[],
  units: UnitsPreference,
): void {
  const loggedByOrder = new Map(
    loggedSetsData.map((ex) => [
      ex.order_index,
      {
        metric: ex.metric,
        sets: ex.session_sets ?? [],
      },
    ])
  );

  for (const row of rows) {
    // Real keys are s<N> for actual sessions
    const match = row.key.match(/^s(\d+)$/);
    if (!match) continue;
    
    const orderIndex = parseInt(match[1], 10);
    const logged = loggedByOrder.get(orderIndex);
    
    if (logged && logged.sets.length > 0 && row.metric) {
      const formatted = formatLoggedSets(
        logged.sets.map((s) => ({
          reps: s.reps,
          weightKg: s.weight_kg,
          durationSeconds: s.duration_seconds,
          isWarmupSet: s.is_warmup_set,
        })),
        row.metric,
        units,
      );
      if (formatted) {
        row.loggedSets = formatted;
      }
    }
  }
}
