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

export type WarmupItem = WarmupRow & { phase: "cardio" | "mobility" | "prehab" };

/** Cardio options in order of preference, by where the user trains. */
const CARDIO_PREFERENCE: Record<string, string[]> = {
  gym: ["easy-bike", "easy-row", "brisk-walk", "march-in-place"],
  home: ["march-in-place", "skipping-light", "brisk-walk"],
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
  const { warmups, trainingMuscles, injuryRegions, track } = input;
  const muscles = new Set(trainingMuscles);
  const regions = new Set(injuryRegions);

  const byType = (t: WarmupRow["type"]) => warmups.filter((w) => w.type === t);

  // 1. Five minutes of easy cardio.
  const preference =
    CARDIO_PREFERENCE[track === "weights" ? "gym" : "home"] ?? CARDIO_PREFERENCE.home;
  const cardioPool = byType("cardio");
  const cardio =
    preference.map((slug) => cardioPool.find((w) => w.slug === slug)).find(Boolean) ??
    cardioPool[0];

  // 2. Five minutes of mobility for what is about to be trained. Exercises that
  //    hit more of today's muscles come first; a general spine drill backfills.
  const mobility = byType("mobility")
    .map((w) => ({
      w,
      overlap: w.target_muscles.filter((m) => muscles.has(m)).length,
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.w.slug.localeCompare(b.w.slug))
    .slice(0, 4)
    .map((x) => x.w);

  if (mobility.length < 3) {
    for (const fallback of ["cat-cow", "arm-circles", "bodyweight-squat", "hip-circles"]) {
      if (mobility.length >= 3) break;
      const w = warmups.find((x) => x.slug === fallback);
      if (w && !mobility.some((m) => m.id === w.id)) mobility.push(w);
    }
  }

  // 3. Targeted prehab for flagged joints.
  const prehab = byType("prehab")
    .filter((w) => w.target_regions.some((r) => regions.has(r)))
    .sort((a, b) => a.slug.localeCompare(b.slug))
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
