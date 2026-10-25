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
export type WarmupInput = {
  warmups: WarmupRow[];
  trainingMuscles: Muscle[];
  injuryRegions?: BodyRegion[];
  prehabRegions?: BodyRegion[];
  track: Track;
  availableEquipment: Set<string> | null;
  hasAllEquipment: boolean;
  pastKneeInjury?: boolean;
};

/**
 * Item 8: Build warm-up input from injury rows.
 * Exported pure function for testing.
 */
export function buildWarmupInput(
  injuries: Array<{ severity: "current" | "past"; body_region: BodyRegion }>,
  warmups: WarmupRow[],
  trainingMuscles: Muscle[],
  track: Track,
  availableEquipment: Set<string> | null,
  hasAllEquipment: boolean
): WarmupInput {
  // All injuries go into injuryRegions and prehabRegions (past injuries need warm-up too)
  const allInjuryRegions = injuries.map(i => i.body_region);
  const pastKneeInjury = injuries.some(i => i.severity === "past" && i.body_region === "knee");
  
  return {
    warmups,
    trainingMuscles,
    injuryRegions: allInjuryRegions,
    prehabRegions: allInjuryRegions,
    track,
    availableEquipment,
    hasAllEquipment,
    pastKneeInjury,
  };
}

export function selectWarmup(input: WarmupInput): WarmupItem[] {
  const { warmups, trainingMuscles, injuryRegions = [], prehabRegions = injuryRegions, track, availableEquipment, hasAllEquipment, pastKneeInjury = false } = input;
  const muscles = new Set(trainingMuscles);
  const regions = new Set(injuryRegions);
  const prehabRegionSet = new Set(prehabRegions);

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
  
  // Item 8: Past knee excludes walking-lunge, skipping-light, and worlds-greatest
  const isExcludedForPastKnee = (slug: string) => {
    if (pastKneeInjury !== true) return false;
    return slug === "walking-lunge" || slug === "skipping-light" || slug === "worlds-greatest";
  };
  
  const cardioPool = byType("cardio");
  // Find cardio that's usable, not excluded, preferring from preference list.
  // Last resort: any non-excluded cardio, even if equipment is missing.
  const cardio =
    preference
      .filter(canUse)
      .filter(slug => !isExcludedForPastKnee(slug))
      .map((slug) => cardioPool.find((w) => w.slug === slug))
      .find(Boolean) ??
    cardioPool.find(w => canUse(w.slug) && !isExcludedForPastKnee(w.slug)) ??
    cardioPool.find(w => !isExcludedForPastKnee(w.slug));

  // QA Pass 10 H7: Filter mobility pool by injuries BEFORE ranking
  const mobilityPool = byType("mobility").filter((w) => {
    // Exclude any warmup that targets an injured region OR is contraindicated for the injury
    const targetsInjury = w.target_regions.some((r) => regions.has(r));
    const contraindicated = (w.contraindicated_regions ?? []).some((r) => regions.has(r));
    // Past knee: exclude walking-lunge and skipping-light
    const excludedForPastKnee = isExcludedForPastKnee(w.slug);
    return !targetsInjury && !contraindicated && !excludedForPastKnee;
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
  const mobility = withOverlap.length >= 2
    ? withOverlap.map((x) => x.w)
    : mobilityRanked.slice(0, Math.max(2, withOverlap.length)).map((x) => x.w);

  if (mobility.length < 3) {
    // Fallback drills, filtered by contraindications. Never suggest a squat for
    // a knee injury or spinal movement for a lower-back injury.
    const fallbackSlugs = ["cat-cow", "arm-circles", "bodyweight-squat", "hip-circles"];
    for (const slug of fallbackSlugs) {
      if (mobility.length >= 3) break;
      const w = warmups.find((x) => x.slug === slug);
      if (!w || mobility.some((m) => m.id === w.id)) continue;
      
      // Filter out contraindicated movements
      const isContraindicated = w.target_regions.some((r) => regions.has(r));
      const excludedForPastKnee = isExcludedForPastKnee(w.slug);
      if (!isContraindicated && !excludedForPastKnee) {
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

  // Filter "full depth" cues for any knee injury (past or current)
  const hasKneeInjury = injuryRegions.includes("knee") || pastKneeInjury === true;
  const filterFullDepthCues = (instructions: string[]) => {
    if (!hasKneeInjury) return instructions;
    return instructions.map(instruction => {
      const lower = instruction.toLowerCase();
      if (lower.includes("full depth")) {
        return instruction.replace(/full depth/gi, "controlled range");
      }
      return instruction;
    });
  };

  return [
    ...(cardio ? [{ ...cardio, phase: "cardio" as const, instructions: filterFullDepthCues(cardio.instructions) }] : []),
    ...mobility.map((w) => ({ ...w, phase: "mobility" as const, instructions: filterFullDepthCues(w.instructions) })),
    ...prehab.map((w) => ({ ...w, phase: "prehab" as const, instructions: filterFullDepthCues(w.instructions) })),
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
