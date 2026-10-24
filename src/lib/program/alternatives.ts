import type { Database } from "@/lib/database.types";

type ExerciseRow = {
  id: string;
  name: string;
  slug: string;
  cue: string | null;
  metric: Database["public"]["Enums"]["exercise_metric"];
  movement_pattern: Database["public"]["Enums"]["movement_pattern"];
  primary_muscles: Database["public"]["Enums"]["muscle"][];
  level_min: Database["public"]["Enums"]["fitness_level"];
  impact: Database["public"]["Enums"]["impact_level"];
  contraindicated_regions: Database["public"]["Enums"]["body_region"][];
  equipment_ids: string[];
};

export type AlternativesContext = {
  level: Database["public"]["Enums"]["fitness_level"];
  availableEquipment: Set<string> | null;
  injuryRegions: Database["public"]["Enums"]["body_region"][];
  limit?: number;
};

const LEVEL_ORDER: Record<Database["public"]["Enums"]["fitness_level"], number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

/**
 * Normalize an exercise name to detect near-duplicates.
 * 
 * Rules:
 * - Lowercase
 * - Strip punctuation
 * - Normalize push-up variants to 'push up'
 * - Remove common filler words
 */
function normalizeName(name: string): string {
  let normalized = name.toLowerCase();
  
  // Strip punctuation
  normalized = normalized.replace(/[^\w\s]/g, " ");
  
  // Normalize push-up variants
  normalized = normalized.replace(/pushups?|push-ups?/g, "push up");
  
  // Remove filler words
  const fillers = [
    "wide", "close", "narrow", "grip", "variation", "version",
    "with", "on", "a", "the", "floor", "knees"
  ];
  
  for (const word of fillers) {
    // Use word boundaries to avoid removing parts of words
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

/**
 * Rank and filter exercise alternatives.
 * 
 * @param current - The exercise being replaced
 * @param candidates - Pool of potential alternatives
 * @param ctx - Context: user level, equipment, injuries, result limit
 * @returns Ranked alternatives, deduplicated and capped at limit (default 5)
 */
export function rankAlternatives(
  current: ExerciseRow,
  candidates: ExerciseRow[],
  ctx: AlternativesContext,
): ExerciseRow[] {
  const limit = ctx.limit ?? 5;
  const userLevelRank = LEVEL_ORDER[ctx.level];
  
  // Dedupe tracking: keep first occurrence per (movement_pattern, normalized name)
  const seen = new Map<string, boolean>();
  
  const filtered: Array<{ exercise: ExerciseRow; score: number }> = [];
  
  for (const candidate of candidates) {
    // 1. Exclude current exercise
    if (candidate.id === current.id) continue;
    
    // 2. Same movement pattern (must match)
    if (candidate.movement_pattern !== current.movement_pattern) continue;
    
    // 3. Level check: candidate level must be <= user level
    const candidateLevelRank = LEVEL_ORDER[candidate.level_min];
    if (candidateLevelRank > userLevelRank) continue;
    
    // 4. Beginners never get high-impact (plyometric) moves
    if (ctx.level === "beginner" && candidate.impact === "high") continue;
    
    // 5. Injury filtering: exclude if any contraindicated region intersects
    if (
      candidate.contraindicated_regions.some((region) =>
        ctx.injuryRegions.includes(region)
      )
    ) {
      continue;
    }
    
    // 6. Equipment check: all-of semantics
    // - null equipment means all equipment available
    // - empty equipment_ids means bodyweight (always OK)
    // - otherwise, ALL of candidate's equipment must be available
    if (ctx.availableEquipment !== null && candidate.equipment_ids.length > 0) {
      const allAvailable = candidate.equipment_ids.every((id) =>
        ctx.availableEquipment!.has(id)
      );
      if (!allAvailable) continue;
    }
    
    // 7. Deduplication: normalize name and check uniqueness within movement pattern
    const normalizedName = normalizeName(candidate.name);
    const dedupeKey = `${candidate.movement_pattern}:${normalizedName}`;
    
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, true);
    
    // Scoring: prefer same primary muscle as current exercise
    // (all other ranking criteria are handled by the generator's scoring elsewhere)
    let score = 0;
    const currentPrimaries = new Set(current.primary_muscles);
    const candidatePrimaries = new Set(candidate.primary_muscles);
    
    // +1 for each matching primary muscle
    for (const muscle of candidatePrimaries) {
      if (currentPrimaries.has(muscle)) {
        score += 1;
      }
    }
    
    filtered.push({ exercise: candidate, score });
  }
  
  // Sort: higher score first, stable sort by slug for determinism
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.exercise.slug.localeCompare(b.exercise.slug);
  });
  
  // Cap at limit
  return filtered.slice(0, limit).map((item) => item.exercise);
}
