/**
 * Generate main baseline snapshot for swap variety testing.
 * This simulates main 25d92f8's ranking with manual pre-filter for excluded slugs.
 */
import { readFileSync, writeFileSync } from "fs";
import { rankAlternatives, buildPatternList } from "../src/lib/program/alternatives";
import { score, hashString } from "../src/lib/program/generate";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));

// Hard-coded list of excluded slugs (not from the module)
const EXCLUDED_SLUGS = new Set([
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
  "barbell-guillotine-bench-press",
  "neck-press",
  "low-pulley-row-to-neck",
]);

const EQUIPMENT_PROFILES: Record<string, Set<string> | null> = {
  "full-gym": null,
  "home-dumbbell-bands": new Set(["dumbbell", "resistance_band", "adjustable_bench"]),
  "cable-dumbbell": new Set(["cable_machine", "dumbbell"]),
  "pullup-bar-only": new Set(["pull_up_bar"]),
  "bodyweight": new Set([]),
  "barbell-rack": new Set(["barbell", "squat_rack", "flat_bench"]),
};

type Level = "beginner" | "intermediate" | "expert";
type BodyRegion = "knee" | "lower_back" | "shoulder" | "neck";

const LEVELS: Level[] = ["beginner", "intermediate", "expert"];
const INJURY_SCENARIOS: Array<{ label: string; regions: BodyRegion[] }> = [
  { label: "none", regions: [] },
  { label: "shoulder", regions: ["shoulder"] },
  { label: "neck", regions: ["neck"] },
  { label: "knee", regions: ["knee"] },
  { label: "lower_back", regions: ["lower_back"] },
];
const TIE_BREAK_SEEDS = ["seed-1", "seed-2", "seed-3"];

type BaselineEntry = {
  exercise: string;
  level: string;
  equipment: string;
  injuries: string;
  seed: string;
  alternatives: string[];
};

const baseline: BaselineEntry[] = [];

for (const exercise of catalogue) {
  const patterns = buildPatternList(exercise.movement_pattern, false);
  const fullPool = catalogue.filter((e: typeof exercise) => patterns.includes(e.movement_pattern));
  
  // Pre-filter: remove excluded slugs and pullovers for compound pulls
  const isCompoundPull =
    (exercise.movement_pattern === "horizontal_pull" || exercise.movement_pattern === "vertical_pull") &&
    exercise.mechanic === "compound";
  const isPulloverOriginal =
    exercise.name.toLowerCase().includes("pullover") || exercise.slug.includes("pullover");
  
  const pool = fullPool.filter((candidate: typeof exercise) => {
    if (candidate.id === exercise.id) return true; // Keep current for the call
    if (EXCLUDED_SLUGS.has(candidate.slug)) return false;
    
    if (isCompoundPull && !isPulloverOriginal) {
      const nameLower = candidate.name.toLowerCase();
      if (nameLower.includes("pullover") || candidate.slug.includes("pullover")) {
        return false;
      }
    }
    
    return true;
  });
  
  for (const [profileName, equipment] of Object.entries(EQUIPMENT_PROFILES)) {
    for (const level of LEVELS) {
      for (const { label: injuryLabel, regions } of INJURY_SCENARIOS) {
        for (const seed of TIE_BREAK_SEEDS) {
          const wantCompound = exercise.mechanic !== "isolation";
          const ctx = {
            level,
            availableEquipment: equipment,
            injuryRegions: regions,
            limit: 5,
            scoreFn: (e: typeof exercise) => score(e, wantCompound, level, "weights"),
            tieBreakFn: (slug: string) => hashString(`${seed}:${slug}`),
          };
          
          const alternatives = rankAlternatives(exercise, pool, ctx);
          
          baseline.push({
            exercise: exercise.slug,
            level,
            equipment: profileName,
            injuries: injuryLabel,
            seed,
            alternatives: alternatives.map((e) => e.slug),
          });
        }
      }
    }
  }
}

writeFileSync(
  "scripts/fixtures/main-baseline.json",
  JSON.stringify(baseline, null, 2)
);

console.log(`Generated baseline with ${baseline.length} entries`);
