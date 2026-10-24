import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "@/lib/program/generate";

export type ExerciseRow = CandidateExercise;
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type AlternativesContext = {
  level: Database["public"]["Enums"]["fitness_level"];
  availableEquipment: Set<string> | null;
  injuryRegions: Database["public"]["Enums"]["body_region"][];
  limit?: number;
  scoreFn: (exercise: ExerciseRow) => number;
  tieBreakFn: (slug: string) => number;
};

const LEVEL_ORDER: Record<Database["public"]["Enums"]["fitness_level"], number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

const FALLBACK_PATTERNS: Partial<Record<MovementPattern, MovementPattern>> = {
  lunge: "squat",
  squat: "lunge",
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
export function rankAlternatives<T extends ExerciseRow>(
  current: T,
  candidates: T[],
  ctx: AlternativesContext,
): T[] {
  const limit = ctx.limit ?? 5;
  
  // Try primary pattern first
  let result = rankForPattern(current, candidates, current.movement_pattern, ctx, limit);
  
  // If empty and there's a fallback pattern, try that
  if (result.length === 0) {
    const fallbackPattern = FALLBACK_PATTERNS[current.movement_pattern];
    if (fallbackPattern) {
      result = rankForPattern(current, candidates, fallbackPattern, ctx, limit);
    }
  }
  
  return result;
}

/**
 * Internal: rank alternatives for a specific movement pattern.
 */
function rankForPattern<T extends ExerciseRow>(
  current: T,
  candidates: T[],
  pattern: MovementPattern,
  ctx: AlternativesContext,
  limit: number,
): T[] {
  const userLevelRank = LEVEL_ORDER[ctx.level];
  
  const filtered: Array<{ exercise: T; primaryScore: number; genScore: number; tieBreak: number }> = [];
  
  for (const candidate of candidates) {
    // 1. Exclude current exercise
    if (candidate.id === current.id) continue;
    
    // 2. Match target pattern
    if (candidate.movement_pattern !== pattern) continue;
    
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
    
    // Scoring: prefer same primary muscle as current exercise
    let primaryScore = 0;
    const currentPrimaries = new Set(current.primary_muscles);
    const candidatePrimaries = new Set(candidate.primary_muscles);
    
    // +1 for each matching primary muscle
    for (const muscle of candidatePrimaries) {
      if (currentPrimaries.has(muscle)) {
        primaryScore += 1;
      }
    }
    
    filtered.push({ 
      exercise: candidate, 
      primaryScore,
      genScore: ctx.scoreFn(candidate),
      tieBreak: ctx.tieBreakFn(candidate.slug),
    });
  }
  
  // Sort: same primary muscle first, then generator score, then hash tiebreak
  filtered.sort((a, b) => {
    if (b.primaryScore !== a.primaryScore) return b.primaryScore - a.primaryScore;
    if (b.genScore !== a.genScore) return b.genScore - a.genScore;
    return a.tieBreak - b.tieBreak;
  });
  
  // Deduplicate AFTER sorting so the best-ranked variant wins
  const seen = new Map<string, boolean>();
  const deduplicated: T[] = [];
  
  for (const item of filtered) {
    const normalizedName = normalizeName(item.exercise.name);
    const dedupeKey = `${item.exercise.movement_pattern}:${normalizedName}`;
    
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, true);
    
    deduplicated.push(item.exercise);
    
    // Stop once we have enough
    if (deduplicated.length >= limit) break;
  }
  
  return deduplicated;
}
