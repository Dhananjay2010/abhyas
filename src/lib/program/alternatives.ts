import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "@/lib/program/generate";
import { isExcludedForPastKnee, getKneeFriendlyRankingBoost } from "@/lib/program/past-knee";

export type ExerciseRow = CandidateExercise;
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type AlternativesContext = {
  level: Database["public"]["Enums"]["fitness_level"];
  availableEquipment: Set<string> | null;
  injuryRegions: Database["public"]["Enums"]["body_region"][];
  pastKneeInjury?: boolean;
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
): MovementPattern[] {
  const patterns: MovementPattern[] = [currentPattern];
  
  // Add direct fallback (lunge↔squat)
  const fallback = FALLBACK_PATTERNS[currentPattern];
  if (fallback && !patterns.includes(fallback)) {
    patterns.push(fallback);
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
 * Check if exercise is knee-friendly for past-knee users
 */
function isKneeFriendlyForRanking(exercise: ExerciseRow): boolean {
  const kneeFriendlySlug = new Set([
    "goblet-squat",
    "box-squat", 
    "leg-press",
    "split-squat-with-dumbbells",
    "dumbbell-rear-lunge",
    "barbell-rear-lunge",
    "barbell-step-ups",
    "dumbbell-step-ups",
    "step-up-with-knee-raise",
    "wall-sit",
  ]);
  
  return kneeFriendlySlug.has(exercise.slug);
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
  
  // Build priority order: same pattern, then fallback, then knee-safe
  const patternPriority = buildPatternList(current.movement_pattern, hasKneeInjury);
  
  // Is current a dynamic press (reps-based, not iso/plyo)?
  const isDynamicPress = 
    (current.movement_pattern === "horizontal_press" || current.movement_pattern === "vertical_press") &&
    current.metric === "reps" &&
    !isIsometric(current) &&
    current.impact !== "high";
  
  // Is current a compound pull (for pullover exclusion)?
  // Exception: if current is itself a pullover, allow pullover swaps
  const isCompoundPull =
    (current.movement_pattern === "horizontal_pull" || current.movement_pattern === "vertical_pull") &&
    current.mechanic === "compound";
  const isPulloverOriginal =
    current.name.toLowerCase().includes("pullover") || current.slug.includes("pullover");
  
  const filtered: Array<{ 
    exercise: T; 
    patternRank: number;
    kneeFriendlyScore: number;
    equipmentScore: number;
    primaryScore: number; 
    impactPenalty: number;
    genScore: number; 
    tieBreak: number 
  }> = [];
  
  for (const candidate of candidates) {
    // 1. Exclude current exercise
    if (candidate.id === current.id) continue;
    
    // 2. Exclude dangerous/problematic exercises (hard-coded exclusion set)
    // Pullovers are shoulder-extension moves and not appropriate substitutes
    if (isCompoundPull && !isPulloverOriginal) {
      const nameLower = candidate.name.toLowerCase();
      if (nameLower.includes("pullover") || candidate.slug.includes("pullover")) {
        continue;
      }
    }
    
    // 4. Pattern priority (lower rank = better)
    const patternRank = patternPriority.indexOf(candidate.movement_pattern);
    if (patternRank === -1) continue; // Not in our pattern list
    
    // 5. Level check: candidate level must be <= user level
    const candidateLevelRank = LEVEL_ORDER[candidate.level_min];
    if (candidateLevelRank > userLevelRank) continue;
    
    // 6. Beginners never get high-impact (plyometric) moves
    if (ctx.level === "beginner" && candidate.impact === "high") continue;
    
    // 7. For dynamic press, exclude isometric and plyometric
    if (isDynamicPress) {
      if (isIsometric(candidate)) continue;
      if (candidate.impact === "high") continue;
    }
    
    // 8. Injury filtering: exclude if any contraindicated region intersects
    if (
      candidate.contraindicated_regions.some((region) =>
        ctx.injuryRegions.includes(region)
      )
    ) {
      continue;
    }
    
    // 9. Past knee: exclude problematic moves
    if (ctx.pastKneeInjury === true && isExcludedForPastKnee(candidate)) {
      continue;
    }
    
    // 10. Equipment check: OR alternatives for specific exercises (past-knee only), else ALL-of semantics
    if (ctx.availableEquipment !== null && candidate.equipment_ids.length > 0) {
      const equipment = ctx.availableEquipment;
      
      // Goblet squat accepts dumbbell OR kettlebell (past-knee users only; main requires strict match)
      if (ctx.pastKneeInjury === true && candidate.slug === "goblet-squat") {
        const hasDumbbell = equipment.has("dumbbell");
        const hasKettlebell = equipment.has("kettlebell");
        if (!hasDumbbell && !hasKettlebell) continue;
      } else {
        // Default: ALL equipment required (AND logic)
        const allAvailable = candidate.equipment_ids.every((id) =>
          equipment.has(id)
        );
        if (!allAvailable) continue;
      }
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
    
    // Past-knee only: filter out cable-hip-adduction (mislabeled adductor claiming quads)
    if (ctx.pastKneeInjury === true) {
      const pastKneeExcludedSwapSlugs = new Set(["cable-hip-adduction"]);
      if (pastKneeExcludedSwapSlugs.has(candidate.slug)) {
        continue;
      }
    }
    
    // Knee-friendly score for past-knee users (ranks before equipment/primary)
    // Lunge: dumbbell-rear-lunge gets boost=2 (must be #1), others get boost=1
    const kneeFriendlyScore = ctx.pastKneeInjury === true ? getKneeFriendlyRankingBoost(candidate) : 0;
    
    // Penalty for high-impact moves (e.g., Lunge Sprint)
    const impactPenalty = candidate.impact === "high" ? 1 : 0;
    
    filtered.push({ 
      exercise: candidate, 
      patternRank,
      kneeFriendlyScore,
      equipmentScore,
      primaryScore,
      impactPenalty,
      genScore: ctx.scoreFn(candidate),
      tieBreak: ctx.tieBreakFn(candidate.slug),
    });
  }
  
  // Sort: pattern priority, knee-friendly (for past-knee), equipment fit, primary muscle, low impact penalty, generator score, hash
  filtered.sort((a, b) => {
    // 1. Same pattern first
    if (a.patternRank !== b.patternRank) return a.patternRank - b.patternRank;
    // 2. Knee-friendly for past-knee users (higher = better)
    if (b.kneeFriendlyScore !== a.kneeFriendlyScore) return b.kneeFriendlyScore - a.kneeFriendlyScore;
    // 3. Equipment fit (higher = better)
    if (b.equipmentScore !== a.equipmentScore) return b.equipmentScore - a.equipmentScore;
    // 4. Primary muscle match
    if (b.primaryScore !== a.primaryScore) return b.primaryScore - a.primaryScore;
    // 5. Avoid high-impact
    if (a.impactPenalty !== b.impactPenalty) return a.impactPenalty - b.impactPenalty;
    // 6. Generator score
    if (b.genScore !== a.genScore) return b.genScore - a.genScore;
    // 7. Hash tiebreak
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
