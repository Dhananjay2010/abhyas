import type { Database } from "@/lib/database.types";
import { buildPatternList } from "@/lib/program/alternatives";
import type { GeneratorInput } from "@/lib/program/generate";

type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

/**
 * Get movement patterns for swap list based on injury flags.
 * Wraps buildPatternList with the anyKneeInjury and hasCurrentKnee flags.
 */
export function getSwapPatterns(
  pattern: MovementPattern,
  input: Pick<GeneratorInput, "anyKneeInjury" | "currentInjuryRegions">,
): MovementPattern[] {
  const hasKneeInjury = input.anyKneeInjury;
  const hasCurrentKnee = input.currentInjuryRegions.includes("knee");
  return buildPatternList(pattern, hasKneeInjury, hasCurrentKnee);
}
