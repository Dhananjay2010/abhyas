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
 * exactly the thing worth warming up properly.
 */
export function selectWarmup(input: {
  warmups: WarmupRow[];
  trainingMuscles: Muscle[];
  injuryRegions: BodyRegion[];
  track: Track;
  availableEquipment: Set<string> | null;
}): WarmupItem[] {
  const { warmups, trainingMuscles, injuryRegions, track, availableEquipment } = input;
  const muscles = new Set(trainingMuscles);
  const regions = new Set(injuryRegions);

  const byType = (t: WarmupRow["type"]) => warmups.filter((w) => w.type === t);

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

  // 2. Five minutes of mobility for what is about to be trained. Exercises that
  //    hit more of today's muscles come first; a general spine drill backfills.
  const mobility = byType("mobility")
    .map((w) => ({
      w,
      overlap: w.target_muscles.filter((m) => muscles.has(m)).length,
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.w.slug < b.w.slug ? -1 : a.w.slug > b.w.slug ? 1 : 0;
    })
    .slice(0, 4)
    .map((x) => x.w);

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
      if (!isContraindicated) {
        mobility.push(w);
      }
    }
  }

  // 3. Targeted prehab for flagged joints.
  const prehab = byType("prehab")
    .filter((w) => w.target_regions.some((r) => regions.has(r)))
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
 */
export function selectCooldown(input: {
  stretches: WarmupRow[];
  trainingMuscles: Muscle[];
}): WarmupItem[] {
  const { stretches, trainingMuscles } = input;
  const muscles = new Set(trainingMuscles);

  // Filter for stretch exercises
  const byType = stretches.filter((w) => w.type === "stretch");

  // Rank stretches by how many of today's muscles they target
  const ranked = byType
    .map((w) => ({
      w,
      overlap: w.target_muscles.filter((m) => muscles.has(m)).length,
    }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.w.slug < b.w.slug ? -1 : a.w.slug > b.w.slug ? 1 : 0;
    })
    .slice(0, 6)
    .map((x) => ({ ...x.w, phase: "stretch" as const }));

  // If no muscle overlap at all, include general full-body stretches.
  // This happens when byType has stretches but none target today's muscles.
  // Filter them by contraindications to avoid suggesting a stretch that loads
  // an injured region.
  if (ranked.length === 0) {
    const generalStretches = ["cat-cow-stretch", "childs-pose", "seated-spinal-twist"];
    const fallback = byType
      .filter((w) => generalStretches.includes(w.slug))
      .slice(0, 3)
      .map((w) => ({ ...w, phase: "stretch" as const }));
    return fallback.length > 0 ? fallback : ranked;
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
