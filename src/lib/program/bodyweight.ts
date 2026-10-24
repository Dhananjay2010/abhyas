/**
 * Equipment that supports bodyweight exercises without adding external load.
 *
 * An exercise using only this equipment is treated as a bodyweight movement,
 * progressing through reps and harder variations rather than weight increments.
 * When a weight IS used (added weight on pull-ups, dips, or holding a plate on
 * a stability ball), the exercise follows bodyweight-with-added-weight rules:
 * smaller steps (1.25 kg or 2.5 kg), never doubled when easy.
 */
export const BODYWEIGHT_SUPPORT_EQUIPMENT = new Set([
  "pull_up_bar",
  "dip_bars",
  "flat_bench",
  "adjustable_bench",
  "stability_ball",
]);

/**
 * An exercise is bodyweight if it uses no equipment, or if EVERY piece of
 * equipment it uses supports bodyweight work.
 *
 * A bench plus dumbbells, or a pull-up bar plus a cable, is loaded.
 */
export function isBodyweightEquipment(
  equipmentIds: readonly string[] | null | undefined,
): boolean {
  if (!equipmentIds || equipmentIds.length === 0) return true;
  return equipmentIds.every((id) => BODYWEIGHT_SUPPORT_EQUIPMENT.has(id));
}
