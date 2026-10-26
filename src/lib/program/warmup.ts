import type { Database } from "@/lib/database.types";

type Muscle = Database["public"]["Enums"]["muscle"];
type BodyRegion = Database["public"]["Enums"]["body_region"];
type Track = Database["public"]["Enums"]["track_type"];

export type WarmupRow = {
  id: string;
  slug: string;
  name: string;
  type: Database["public"]["Enums"]["warmup_type"];
  target_regions: BodyRegion[];
  target_muscles: Muscle[];
  duration_seconds: number;
  instructions: string[];
  equipment_ids: string[];
  contraindicated_regions: BodyRegion[];
};

export type WarmupItem = WarmupRow & { phase: "cardio" | "mobility" | "prehab" | "stretch" };

/**
 * Knee-loading mobility exercises excluded for past-knee users.
 * A past-knee user has knee in prehabRegions (any severity) but not in
 * injuryRegions (current). These exercises load the knee during mobility work.
 */
export const PAST_KNEE_EXCLUDED_WARMUP_SLUGS: ReadonlySet<string> = new Set([
  "bodyweight-squat",
  "walking-lunge",
  "worlds-greatest",
]);

/**
 * Detect if user has past knee injury (knee in prehab but not current).
 */
function isPastKneeUser(
  injuryRegions: Set<BodyRegion>,
  prehabRegions: Set<BodyRegion>
): boolean {
  return prehabRegions.has("knee") && !injuryRegions.has("knee");
}

/** Cardio options in order of preference, by where the user trains. */
const CARDIO_PREFERENCE: Record<string, string[]> = {
  gym: ["easy-bike", "easy-row", "brisk-walk", "march-in-place"],
  home: ["march-in-place", "skipping-light", "brisk-walk"],
};

/**
 * What each cardio warm-up needs before it can be suggested.
 *
 * `warmup_exercises` carries no equipment column, so the requirement lives
 * here. Without it the gym preference list opens with "Easy stationary bike"
 * for every weights user, whatever they told us they have — a plan that led
 * with a bike for someone whose only equipment was a yoga mat, directly
 * contradicting "We never suggest an exercise you cannot do." The last two
 * options in each list need nothing, so there is always something left.
 */
const CARDIO_EQUIPMENT: Record<string, string> = {
  "easy-bike": "stationary_bike",
  "easy-row": "rowing_machine",
  "skipping-light": "jump_rope",
};

/**
 * Build the 15-minute warm-up for a session: general cardio, then mobility for
 * the muscles about to be trained, then prehab for any flagged joint.
 *
 * Prehab uses BOTH current and past injuries. A past injury does not stop you
 * training a movement (see the generator's eligibility rules), but it is
 * exactly the thing worth warming up properly. Pass prehabRegions separately
 * from injuryRegions to include past injuries in prehab while excluding only
 * current injuries from mobility.
 */
export function selectWarmup(input: {
  warmups: WarmupRow[];
  trainingMuscles: Muscle[];
  injuryRegions?: BodyRegion[];
  prehabRegions?: BodyRegion[];
  track: Track;
  availableEquipment: Set<string> | null;
  hasAllEquipment: boolean;
}): WarmupItem[] {
  const { warmups, trainingMuscles, injuryRegions = [], prehabRegions = injuryRegions, track, availableEquipment, hasAllEquipment } = input;
  const muscles = new Set(trainingMuscles);
  const regions = new Set(injuryRegions);
  const prehabRegionSet = new Set(prehabRegions);

  const isPastKnee = isPastKneeUser(regions, prehabRegionSet);

  // QA Pass 10 (h): Equipment filter helper - ALL-of logic, same as exercises
  const canUseEquipment = (w: WarmupRow) => {
    if (hasAllEquipment) return true;
    const equipmentIds = w.equipment_ids ?? [];
    if (equipmentIds.length === 0) return true;
    if (!availableEquipment) return false;
    // ALL equipment required (AND logic)
    return equipmentIds.every((e) => availableEquipment.has(e));
  };

  const byType = (t: WarmupRow["type"]) => 
    warmups.filter((w) => w.type === t && canUseEquipment(w));

  // 1. Five minutes of easy cardio.
  const preference =
    CARDIO_PREFERENCE[track === "weights" ? "gym" : "home"] ?? CARDIO_PREFERENCE.home;
  // A null set means "has everything"; an empty one means they listed nothing.
  const canUse = (slug: string) => {
    const needs = CARDIO_EQUIPMENT[slug];
    return !needs || availableEquipment === null || availableEquipment.has(needs);
  };
  const cardioPool = byType("cardio");
  const cardio =
    preference
      .filter(canUse)
      .map((slug) => cardioPool.find((w) => w.slug === slug))
      .find(Boolean) ??
    cardioPool.find((w) => canUse(w.slug)) ??
    cardioPool[0];

  // QA Pass 10 H7: Filter mobility pool by injuries BEFORE ranking
  const mobilityPool = byType("mobility").filter((w) => {
    // Exclude any warmup that targets an injured region OR is contraindicated for the injury
    const targetsInjury = w.target_regions.some((r) => regions.has(r));
    const contraindicated = (w.contraindicated_regions ?? []).some((r) => regions.has(r));
    return !(targetsInjury || contraindicated);
  });
  
  // 2. Five minutes of mobility for what is about to be trained. Exercises that
  //    hit more of today's muscles come first; a general spine drill backfills.
  //    QA: Always include at least one dynamic mobility drill, not just cardio.
  const mobilityRanked = mobilityPool
    .map((w) => ({
      w,
      overlap: w.target_muscles.filter((m) => muscles.has(m)).length,
    }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.w.slug < b.w.slug ? -1 : a.w.slug > b.w.slug ? 1 : 0;
    });
  
  // Take top 4 with muscle overlap, or at minimum take top 2 mobility drills
  // even if overlap is zero, to ensure activation work is included.
  const withOverlap = mobilityRanked.filter((x) => x.overlap > 0).slice(0, 4);
  let mobility = withOverlap.length >= 2
    ? withOverlap.map((x) => x.w)
    : mobilityRanked.slice(0, Math.max(2, withOverlap.length)).map((x) => x.w);

  // Past-knee exclusion: replace excluded drills 1:1 with alternatives
  // to maintain the same count and total time as main would produce.
  // Prefer knee-safe lower-body drills first, then other non-excluded drills of same duration.
  // On lower days, never use non-lower drills while knee-safe lower drills remain.
  if (isPastKnee) {
    const excluded = mobility.filter(w => PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug));
    
    if (excluded.length > 0) {
      const kneeSafeLowerDrills = ["glute-bridge", "hip-circles", "leg-swing-front", "leg-swing-side"];
      const lowerMuscleGroups = ["quads", "glutes", "hamstrings", "calves", "hip_flexors", "lower_back", "abs", "obliques"];
      const isLowerDay = Array.from(muscles).some(m => lowerMuscleGroups.includes(m));
      
      // Build replacement pool
      let availableReplacements = mobilityPool
        .filter(w => 
          !PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug) && 
          !mobility.some(m => m.id === w.id)
        );
      
      for (const excludedDrill of excluded) {
        let replacement: typeof availableReplacements[0] | undefined;
        
        // Strategy 1: same-duration knee-safe lower drill
        replacement = availableReplacements.find(w =>
          w.duration_seconds === excludedDrill.duration_seconds &&
          kneeSafeLowerDrills.includes(w.slug)
        );
        
        // Strategy 2 (lower days only): any knee-safe lower drill
        if (!replacement && isLowerDay) {
          replacement = availableReplacements.find(w => kneeSafeLowerDrills.includes(w.slug));
        }
        
        // Strategy 3: same-duration non-lower drill (only if no knee-safe lower drills remain)
        if (!replacement) {
          const hasKneeSafeLower = availableReplacements.some(w => kneeSafeLowerDrills.includes(w.slug));
          if (!isLowerDay || !hasKneeSafeLower) {
            replacement = availableReplacements.find(w => w.duration_seconds === excludedDrill.duration_seconds);
          }
        }
        
        // Strategy 4: any available drill (only if no knee-safe lower drills remain on lower days)
        if (!replacement) {
          const hasKneeSafeLower = availableReplacements.some(w => kneeSafeLowerDrills.includes(w.slug));
          if (!isLowerDay || !hasKneeSafeLower) {
            replacement = availableReplacements[0];
          }
        }
        
        if (replacement) {
          const idx = mobility.findIndex(m => m.id === excludedDrill.id);
          if (idx >= 0) {
            mobility[idx] = replacement;
            // Remove from available pool
            availableReplacements = availableReplacements.filter(r => r.id !== replacement!.id);
          }
        } else {
          // No replacement available; remove the excluded drill
          mobility = mobility.filter(m => m.id !== excludedDrill.id);
        }
      }
    }
  }

  if (mobility.length < 3) {
    // Fallback drills, filtered by contraindications. Never suggest a squat for
    // a knee injury or spinal movement for a lower-back injury.
    // For past-knee users training lower body, prefer knee-safe lower-body drills.
    const fallbackSlugs = isPastKnee 
      ? ["glute-bridge", "hip-circles", "leg-swing-front", "leg-swing-side", "cat-cow", "arm-circles"]
      : ["cat-cow", "arm-circles", "bodyweight-squat", "hip-circles"];
    
    for (const slug of fallbackSlugs) {
      if (mobility.length >= 3) break;
      
      const w = warmups.find((x) => x.slug === slug);
      if (!w || mobility.some((m) => m.id === w.id)) continue;
      
      // Filter out contraindicated movements
      const isContraindicated = w.target_regions.some((r) => regions.has(r));
      // For past-knee, equipment filter ensures BW-only users get appropriate drills
      if (!isContraindicated && (isPastKnee ? canUseEquipment(w) : true)) {
        mobility.push(w);
      }
    }
  }

  // 3. Targeted prehab for flagged joints.
  // QA Pass 10 C2/H7: Prehab drills that target the injured region are WANTED
  // (gentle activation/stability work for the injury). Mobility that LOADS the
  // injured region is filtered above. Equipment filter ensures BW-only users
  // get appropriate drills.
  // QA Pass 11: Prehab uses ALL injuries (past and current) - past injuries benefit from warming up.
  const prehab = byType("prehab")
    .filter((w) => {
      // Only include prehab that targets an injured region (using prehabRegions, which includes past injuries)
      const targetsInjury = w.target_regions.some((r) => prehabRegionSet.has(r));
      if (!targetsInjury) return false;
      
      // Filter by available equipment - prehab uses ALL-of logic (every), consistent with warm-up and cool-down
      const equipmentIds = w.equipment_ids ?? [];
      return equipmentIds.length === 0 || 
        availableEquipment === null || 
        equipmentIds.every((id) => availableEquipment.has(id));
    })
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 3);

  return [
    ...(cardio ? [{ ...cardio, phase: "cardio" as const }] : []),
    ...mobility.map((w) => ({ ...w, phase: "mobility" as const })),
    ...prehab.map((w) => ({ ...w, phase: "prehab" as const })),
  ];
}

export function warmupSeconds(items: WarmupItem[]): number {
  return items.reduce((n, i) => n + i.duration_seconds, 0);
}

/**
 * Select 5-6 stretch exercises for the cool-down, prioritizing muscles that
 * were actually trained in the session. Static stretches with timed holds,
 * not the dynamic mobility work from the warm-up.
 * 
 * QA Pass 10 H7: Filter by current injuries to avoid stretches that load
 * contraindicated regions.
 */
export function selectCooldown(input: {
  stretches: WarmupRow[];
  trainingMuscles: Muscle[];
  injuryRegions?: BodyRegion[];
  hasAllEquipment: boolean;
  availableEquipment: Set<string> | null;
}): WarmupItem[] {
  const { stretches, trainingMuscles, injuryRegions = [], hasAllEquipment, availableEquipment } = input;
  const muscles = new Set(trainingMuscles);
  const regions = new Set(injuryRegions);

  // QA Pass 10 (h): Equipment filter - ALL-of logic
  const canUseEquipment = (w: WarmupRow) => {
    if (hasAllEquipment) return true;
    const equipmentIds = w.equipment_ids ?? [];
    if (equipmentIds.length === 0) return true;
    if (!availableEquipment) return false;
    // ALL equipment required (AND logic)
    return equipmentIds.every((e) => availableEquipment.has(e));
  };

  // QA Pass 11: Only exclude stretches contraindicated for the injury, not those that merely target it.
  // A shoulder-injured Upper day should still get upper-body stretches (gentle stretching is therapeutic).
  const eligible = stretches.filter((w) => {
    if (w.type !== "stretch") return false;
    const contraindicated = (w.contraindicated_regions ?? []).some((r) => regions.has(r));
    if (contraindicated) return false;
    return canUseEquipment(w);
  });

  // Map trained muscles to their regions for padding logic
  const trainedRegions = new Set<BodyRegion>();
  for (const muscle of muscles) {
    // Upper body muscles
    if (['chest', 'lats', 'front_delts', 'side_delts', 'rear_delts', 'traps', 'biceps', 'triceps', 'forearms'].includes(muscle)) {
      trainedRegions.add('shoulder');
      trainedRegions.add('upper_back');
      trainedRegions.add('neck');
    }
    // Lower body muscles
    if (['quads', 'hamstrings', 'glutes'].includes(muscle)) {
      trainedRegions.add('hip');
      trainedRegions.add('knee');
      trainedRegions.add('lower_back'); // core stability for lower
    }
    if (['calves'].includes(muscle)) {
      trainedRegions.add('ankle');
    }
    // Core
    if (['abs', 'obliques'].includes(muscle)) {
      trainedRegions.add('lower_back');
    }
  }

  // Identify upper vs lower workout for padding logic
  const upperMuscles = ['chest', 'lats', 'front_delts', 'side_delts', 'rear_delts', 'traps', 'biceps', 'triceps', 'forearms'];
  const lowerMuscles = ['quads', 'hamstrings', 'glutes', 'calves'];
  const isUpperDay = trainingMuscles.some(m => upperMuscles.includes(m));
  const isLowerDay = trainingMuscles.some(m => lowerMuscles.includes(m));

  // Rank stretches: first those targeting injured regions (gentle therapeutic stretch),
  // then by muscle overlap, then by region overlap with trained regions
  // Filter out region mismatches: don't pad Upper with lower-only or Lower with upper-only
  const ranked = eligible
    .map((w) => {
      const targetsInjury = w.target_regions.some((r) => regions.has(r));
      const muscleOverlap = w.target_muscles.filter((m) => muscles.has(m)).length;
      const regionOverlap = w.target_regions.filter((r) => trainedRegions.has(r)).length;
      
      // Check if this stretch is appropriate for the day type
      const upperOnlyRegions = ['shoulder', 'neck', 'upper_back'];
      const lowerOnlyRegions = ['hip', 'knee', 'ankle', 'calf'];
      const isUpperOnlyStretch = w.target_regions.some(r => upperOnlyRegions.includes(r)) &&
                                 !w.target_regions.some(r => lowerOnlyRegions.includes(r));
      const isLowerOnlyStretch = w.target_regions.some(r => lowerOnlyRegions.includes(r)) &&
                                 !w.target_regions.some(r => upperOnlyRegions.includes(r));
      
      // Exclude mismatches: upper-only stretch on lower day, or lower-only stretch on upper day
      const isRegionMismatch = (isUpperDay && isLowerOnlyStretch && muscleOverlap === 0) ||
                               (isLowerDay && isUpperOnlyStretch && muscleOverlap === 0);
      
      return { w, targetsInjury, muscleOverlap, regionOverlap, isRegionMismatch };
    })
    .filter(x => !x.isRegionMismatch)
    .sort((a, b) => {
      // Prioritize stretches targeting injured regions (gentle therapeutic stretch)
      if (a.targetsInjury !== b.targetsInjury) return b.targetsInjury ? 1 : -1;
      // Then by muscle overlap
      if (b.muscleOverlap !== a.muscleOverlap) return b.muscleOverlap - a.muscleOverlap;
      // Then by region overlap with trained regions
      if (b.regionOverlap !== a.regionOverlap) return b.regionOverlap - a.regionOverlap;
      return a.w.slug < b.w.slug ? -1 : a.w.slug > b.w.slug ? 1 : 0;
    })
    .slice(0, 6)
    .map((x) => ({ ...x.w, phase: "stretch" as const }));

  // If we got fewer than 3 stretches, pad with general full-body stretches
  if (ranked.length < 3) {
    const generalStretches = ["cat-cow-stretch", "childs-pose", "seated-spinal-twist"];
    const remaining = eligible
      .filter((w) => !ranked.some(r => r.id === w.id))
      .filter((w) => generalStretches.includes(w.slug))
      .slice(0, 6 - ranked.length)
      .map((w) => ({ ...w, phase: "stretch" as const }));
    
    return [...ranked, ...remaining];
  }

  return ranked;
}

/**
 * Filter warm-up or cool-down items by current injuries, removing any that
 * would load a contraindicated region. Use this after selection to ensure
 * safety.
 */
export function filterByInjury(
  items: WarmupItem[],
  injuryRegions: BodyRegion[]
): WarmupItem[] {
  if (injuryRegions.length === 0) return items;
  
  const regions = new Set(injuryRegions);
  return items.filter((item) => {
    // Exclude any warmup that targets an injured region
    return !item.target_regions.some((r) => regions.has(r));
  });
}
