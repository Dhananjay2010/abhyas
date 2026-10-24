import type { Database } from "@/lib/database.types";

/**
 * Equipment that supports bodyweight exercises but doesn't add external load.
 * Exercises using ONLY these items have loadReducible=false (rep/hold trim applies).
 */
export const BODYWEIGHT_ONLY_EQUIPMENT = new Set([
  "pull_up_bar",
  "dip_bars",
  "bench",
  "flat_bench",
  "incline_bench",
  "decline_bench",
  "stability_ball",
  "mat",
  "none",
]);

/**
 * Check if exercise is bodyweight-only (not progressively loadable).
 * True when: no equipment OR all equipment is bodyweight-only.
 */
export function isBodyweightOnly(equipmentIds: string[]): boolean {
  if (equipmentIds.length === 0) return true;
  return equipmentIds.every((id) => BODYWEIGHT_ONLY_EQUIPMENT.has(id));
}

/**
 * Determine if an exercise is load-reducible (eligible for set cuts on deload).
 * 
 * Load-reducible is false for:
 * - bodyweight-only exercises (no equipment or only bodyweight equipment like pull-up bars)
 * - holds (metric === "seconds")
 * 
 * It's true for exercises with loaded equipment (barbell, dumbbells, etc.) and reps metric.
 */
export function loadReducibleFor(
  equipmentIds: string[],
  metric: Database["public"]["Enums"]["exercise_metric"],
): boolean {
  return !isBodyweightOnly(equipmentIds) && metric === "reps";
}
