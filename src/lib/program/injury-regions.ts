import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

export interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

/**
 * Returns body regions that should be treated as active injuries for exercise selection.
 * 
 * For program generation and swap suggestions:
 * - All CURRENT injuries are included
 * - PAST knee injuries are included (owner has past knee surgery, needs protection)
 * - Other past injuries are excluded (only affect warm-up/prehab, not exercise selection)
 * 
 * This applies to:
 * - Squat/lunge allowlist filtering (only knee-safe quads allowed)
 * - Floor-pull deadlift exclusion (all RDL and conventional deadlifts excluded)
 * - Adjacent hinge constraints
 * 
 * @param injuries - Array of injury records with region and severity
 * @returns Array of body regions to filter exercises against
 * 
 * @example
 * selectionInjuryRegions([
 *   { region: "knee", severity: "past" },
 *   { region: "shoulder", severity: "past" },
 *   { region: "lower_back", severity: "current" }
 * ])
 * // => ["knee", "lower_back"]
 */
export function selectionInjuryRegions(injuries: InjuryRow[]): BodyRegion[] {
  const regions: BodyRegion[] = [];
  
  for (const injury of injuries) {
    // All current injuries count
    if (injury.severity === "current") {
      regions.push(injury.region);
    }
    // ONLY past knee injuries count for selection (owner requirement)
    else if (injury.severity === "past" && injury.region === "knee") {
      regions.push(injury.region);
    }
  }
  
  return regions;
}
