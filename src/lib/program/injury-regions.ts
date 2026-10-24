import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

export interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

/**
 * Returns body regions that should be treated as CURRENT injuries for exercise selection.
 * 
 * For program generation and swap suggestions:
 * - All CURRENT injuries are included
 * - Past injuries are excluded (only affect warm-up/prehab and specific rules below)
 * 
 * This applies to:
 * - Squat allowlist filtering (only knee-safe quads for CURRENT knee)
 * - Floor-pull deadlift exclusion (CURRENT knee only)
 * - Adjacent hinge constraints (CURRENT knee only)
 * 
 * @param injuries - Array of injury records with region and severity
 * @returns Array of body regions to filter exercises against
 * 
 * @example
 * currentInjuryRegions([
 *   { region: "knee", severity: "past" },
 *   { region: "shoulder", severity: "past" },
 *   { region: "lower_back", severity: "current" }
 * ])
 * // => ["lower_back"]
 */
export function currentInjuryRegions(injuries: InjuryRow[]): BodyRegion[] {
  const regions: BodyRegion[] = [];
  
  for (const injury of injuries) {
    if (injury.severity === "current") {
      regions.push(injury.region);
    }
  }
  
  return regions;
}

/**
 * Checks if user has any knee injury (current OR past) for jump/plyometric exclusion.
 * 
 * Past knee surgery requires jump exclusion but NOT squat allowlist restriction.
 * 
 * @param injuries - Array of injury records
 * @returns true if any knee injury exists (current or past)
 */
export function hasAnyKneeInjury(injuries: InjuryRow[]): boolean {
  return injuries.some(injury => 
    injury.region === "knee" && (injury.severity === "current" || injury.severity === "past")
  );
}

/**
 * Builds GeneratorInput injury flags from database injury rows.
 * Used by persist.ts, rollover.ts, and actions.ts to maintain ONE-LINE usage.
 * 
 * Returns object with:
 * - currentInjuryRegions: CURRENT injuries only (squat allowlist, deadlift exclusion, hinges)
 * - anyKneeInjury: Current OR past knee (jump/plyo/lunge exclusions)
 * 
 * @param dbInjuries - Array of database injury rows with body_region/severity
 * @returns Injury flags for GeneratorInput
 */
export function buildInjuryFlags(dbInjuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }>) {
  const injuries: InjuryRow[] = dbInjuries.map(inj => ({ region: inj.body_region, severity: inj.severity }));
  return {
    currentInjuryRegions: currentInjuryRegions(injuries),
    anyKneeInjury: hasAnyKneeInjury(injuries),
  };
}
