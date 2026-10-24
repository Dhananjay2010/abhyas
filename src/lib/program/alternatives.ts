import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "@/lib/program/generate";
import { PAST_KNEE_LUNGE_EXERCISES, KNEE_SAFE_LUNGE_EXERCISES } from "@/lib/program/generate";

export type ExerciseRow = CandidateExercise;
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type AlternativesContext = {
  level: Database["public"]["Enums"]["fitness_level"];
  availableEquipment: Set<string> | null;
  injuryRegions: Database["public"]["Enums"]["body_region"][];
  anyKneeInjury?: boolean;
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

// Knee-safe lower-body patterns (hinge work, plus core holds like wall-sit)
const KNEE_SAFE_LOWER_PATTERNS: MovementPattern[] = ["hinge", "core"];

/**
 * Build the list of patterns to query for alternatives.
 * Returns [currentPattern, ...fallbackPatterns, ...kneeSafePatterns if applicable]
 */
export function buildPatternList(
  currentPattern: MovementPattern,
  hasKneeInjury: boolean,
  hasCurrentKnee?: boolean,
): MovementPattern[] {
  const patterns: MovementPattern[] = [currentPattern];
  
  // For CURRENT knee injuries on lunge pattern, DON'T add squat fallback
  // (would widen to barbell-squat, hack-squat, etc. which aren't on the knee-safe list)
  // For PAST knee, DO add squat fallback (PAST_KNEE_LUNGE_EXERCISES are squat pattern)
  const skipFallback = (hasCurrentKnee ?? hasKneeInjury) && currentPattern === "lunge";
  
  if (!skipFallback) {
    // Add direct fallback (lunge↔squat)
    const fallback = FALLBACK_PATTERNS[currentPattern];
    if (fallback && !patterns.includes(fallback)) {
      patterns.push(fallback);
    }
  }
  
  // For knee injuries on lower-body patterns, add knee-safe alternatives
  if (hasKneeInjury && (currentPattern === "lunge" || currentPattern === "squat")) {
    for (const pattern of KNEE_SAFE_LOWER_PATTERNS) {
      if (!patterns.includes(pattern)) {
        patterns.push(pattern);
      }
    }
  }
  
  return patterns;
}

/**
 * Normalize an exercise name to detect near-duplicates.
 * 
 * Rules:
 * - Lowercase
 * - Strip parentheticals
 * - Strip punctuation
 * - Normalize push-up variants to 'push up'
 * - Remove common filler words (hand position, grip, width, stance)
 */
function normalizeName(name: string): string {
  let normalized = name.toLowerCase();
  
  // Strip parentheticals
  normalized = normalized.replace(/\([^)]*\)/g, " ");
  
  // Strip punctuation
  normalized = normalized.replace(/[^\w\s]/g, " ");
  
  // Normalize push-up variants
  normalized = normalized.replace(/pushups?|push-ups?/g, "push up");
  
  // Remove filler words for hand position, grip, width, stance
  const fillers = [
    "wide", "close", "narrow", "grip", "grips",
    "variation", "version", "position", "positions",
    "with", "on", "a", "the", "and", "or",
    "floor", "knees", "hand", "hands",
    "stance", "foot", "feet",
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
 * Check if an exercise is isometric (holds, static positions)
 */
function isIsometric(exercise: ExerciseRow): boolean {
  return (
    exercise.metric === "seconds" ||
    exercise.name.toLowerCase().includes("isometric") ||
    exercise.slug.includes("isometric")
  );
}

/**
 * Score equipment/load fit: prefer similar equipment to current
 */
function scoreEquipmentFit(current: ExerciseRow, candidate: ExerciseRow): number {
  const currentEquipment = new Set(current.equipment_ids);
  const candidateEquipment = new Set(candidate.equipment_ids);
  
  // Both bodyweight
  if (currentEquipment.size === 0 && candidateEquipment.size === 0) return 100;
  
  // Current is loaded, candidate is bodyweight - lower score
  if (currentEquipment.size > 0 && candidateEquipment.size === 0) return 10;
  
  // Current is bodyweight, candidate is loaded - slightly lower
  if (currentEquipment.size === 0 && candidateEquipment.size > 0) return 20;
  
  // Both loaded - score by overlap
  let overlap = 0;
  for (const eq of candidateEquipment) {
    if (currentEquipment.has(eq)) overlap++;
  }
  
  // High overlap = better fit
  return 50 + overlap * 20;
}

/**
 * Rank and filter exercise alternatives.
 * 
 * @param current - The exercise being replaced
 * @param candidates - Pool of potential alternatives (from all relevant patterns)
 * @param ctx - Context: user level, equipment, injuries, result limit
 * @returns Ranked alternatives, deduplicated and capped at limit (default 5)
 */
export function rankAlternatives<T extends ExerciseRow>(
  current: T,
  candidates: T[],
  ctx: AlternativesContext,
): T[] {
  const limit = ctx.limit ?? 5;
  const userLevelRank = LEVEL_ORDER[ctx.level];
  const hasKneeInjury = ctx.injuryRegions.includes("knee");
  const hasPastKnee = (ctx.anyKneeInjury ?? false) && !hasKneeInjury;
  
  // Build priority order: same pattern, then fallback, then knee-safe
  // For past-knee lunge swaps, we need squat pattern (the 4-list are squat pattern)
  let patternPriority: MovementPattern[];
  if (hasPastKnee && current.movement_pattern === "lunge") {
    patternPriority = ["lunge", "squat"]; // Must include squat for the 4-list
  } else {
    patternPriority = buildPatternList(current.movement_pattern, ctx.anyKneeInjury ?? false);
  }
  
  // Is current a dynamic press (reps-based, not iso/plyo)?
  const isDynamicPress = 
    (current.movement_pattern === "horizontal_press" || current.movement_pattern === "vertical_press") &&
    current.metric === "reps" &&
    !isIsometric(current) &&
    current.impact !== "high";
  
  const filtered: Array<{ 
    exercise: T; 
    patternRank: number;
    equipmentScore: number;
    primaryScore: number; 
    impactPenalty: number;
    genScore: number; 
    tieBreak: number 
  }> = [];
  
  for (const candidate of candidates) {
    // 1. Exclude current exercise
    if (candidate.id === current.id) continue;
    
    // 2. Pattern priority (lower rank = better)
    const patternRank = patternPriority.indexOf(candidate.movement_pattern);
    if (patternRank === -1) continue; // Not in our pattern list
    
    // 2b. Past-knee lunge swaps: ONLY allow the 4-exercise quad list
    if (hasPastKnee && current.movement_pattern === "lunge") {
      if (!PAST_KNEE_LUNGE_EXERCISES.has(candidate.slug)) {
        continue;
      }
    }
    
    // 3. Level check: candidate level must be <= user level
    const candidateLevelRank = LEVEL_ORDER[candidate.level_min];
    if (candidateLevelRank > userLevelRank) continue;
    
    // 4. Beginners never get high-impact (plyometric) moves
    if (ctx.level === "beginner" && candidate.impact === "high") continue;
    
    // 4b. PR #73: Knee injuries exclude high-impact lower-body moves
    if ((ctx.anyKneeInjury ?? false) && candidate.impact === "high") {
      const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
      const isLowerBody = candidate.primary_muscles.some(m => lowerBodyMuscles.includes(m));
      if (isLowerBody) continue;
    }
    
    // 5. For dynamic press, exclude isometric and plyometric
    if (isDynamicPress) {
      if (isIsometric(candidate)) continue;
      if (candidate.impact === "high") continue;
    }
    
    // 6. Injury filtering: exclude if any contraindicated region intersects
    // PR #73: For current knee + knee-safe lunge exercises, skip knee contraindication check
    // These exercises are marked as contraindicated but are actually safe
    const isKneeSafeLunge = hasKneeInjury && 
                           candidate.movement_pattern === "lunge" && 
                           KNEE_SAFE_LUNGE_EXERCISES.has(candidate.slug);
    const contraindicationsToCheck = isKneeSafeLunge
      ? candidate.contraindicated_regions.filter(r => r !== "knee")
      : candidate.contraindicated_regions;
    
    if (
      contraindicationsToCheck.some((region) =>
        ctx.injuryRegions.includes(region)
      )
    ) {
      continue;
    }
    
    // 7. Equipment check: all-of semantics
    if (ctx.availableEquipment !== null && candidate.equipment_ids.length > 0) {
      const allAvailable = candidate.equipment_ids.every((id) =>
        ctx.availableEquipment!.has(id)
      );
      if (!allAvailable) continue;
    }
    
    // Scoring
    const equipmentScore = scoreEquipmentFit(current, candidate);
    
    let primaryScore = 0;
    const currentPrimaries = new Set(current.primary_muscles);
    const candidatePrimaries = new Set(candidate.primary_muscles);
    for (const muscle of candidatePrimaries) {
      if (currentPrimaries.has(muscle)) {
        primaryScore += 1;
      }
    }
    
    // Penalty for high-impact moves (e.g., Lunge Sprint)
    const impactPenalty = candidate.impact === "high" ? 1 : 0;
    
    filtered.push({ 
      exercise: candidate, 
      patternRank,
      equipmentScore,
      primaryScore,
      impactPenalty,
      genScore: ctx.scoreFn(candidate),
      tieBreak: ctx.tieBreakFn(candidate.slug),
    });
  }
  
  // Sort: pattern priority, equipment fit, primary muscle, low impact penalty, generator score, hash
  filtered.sort((a, b) => {
    // 1. Same pattern first
    if (a.patternRank !== b.patternRank) return a.patternRank - b.patternRank;
    // 2. Equipment fit (higher = better)
    if (b.equipmentScore !== a.equipmentScore) return b.equipmentScore - a.equipmentScore;
    // 3. Primary muscle match
    if (b.primaryScore !== a.primaryScore) return b.primaryScore - a.primaryScore;
    // 4. Avoid high-impact
    if (a.impactPenalty !== b.impactPenalty) return a.impactPenalty - b.impactPenalty;
    // 5. Generator score
    if (b.genScore !== a.genScore) return b.genScore - a.genScore;
    // 6. Hash tiebreak
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
  
  // Fallback for past-knee lunge swaps: if empty, add bodyweight options from the 4-list
  if (deduplicated.length === 0 && hasPastKnee && current.movement_pattern === "lunge") {
    const bodyweightFallbacks = ["wall-sit", "spanish-squat"];
    for (const slug of bodyweightFallbacks) {
      const fallback = candidates.find(c => c.slug === slug);
      if (fallback && fallback.equipment_ids.length === 0) {
        deduplicated.push(fallback);
        if (deduplicated.length >= limit) break;
      }
    }
  }
  
  return deduplicated;
}
