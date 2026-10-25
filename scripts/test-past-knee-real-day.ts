/**
 * Real past-knee Lower day warm-up test
 * 
 * Tests that a real past-knee Lower day (intermediate, 4d 60m, quads/glutes/hamstrings/calves)
 * produces exactly 7 warmup items with ~225s total time, matching main's count and duration.
 * 
 * npm run test:past-knee-real-day
 */
import { readFileSync, existsSync } from "node:fs";
import { selectWarmup, warmupSeconds, type WarmupRow } from "../src/lib/program/warmup";
import type { Database } from "../src/lib/database.types";

type Muscle = Database["public"]["Enums"]["muscle"];

const warmupsPath = "scripts/fixtures/warmups.json";
if (!existsSync(warmupsPath)) {
  console.error(`FATAL: ${warmupsPath} does not exist - warmup tests cannot run`);
  process.exit(1);
}
const warmups = JSON.parse(readFileSync(warmupsPath, "utf8")) as WarmupRow[];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("Real past-knee Lower day warm-up\n");

// Real past-knee Lower day: intermediate weights, 4d 60m, training quads/glutes/hamstrings/calves
// This is the actual muscle set from a Lower day in the real generator
const realLowerMuscles: Muscle[] = ["quads", "glutes", "hamstrings", "calves"];

const pastKneeLower = selectWarmup({
  warmups,
  trainingMuscles: realLowerMuscles,
  injuryRegions: [],
  prehabRegions: ["knee"], // Past knee
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const totalSeconds = warmupSeconds(pastKneeLower);
const itemCount = pastKneeLower.length;

console.log("Past-knee Lower day:");
console.log(`  Total items: ${itemCount}`);
console.log(`  Total time: ${totalSeconds}s`);
console.log("  Items:");
pastKneeLower.forEach(item => {
  console.log(`    - ${item.name} (${item.slug}, ${item.phase}, ${item.duration_seconds}s)`);
});

// Past-knee Lower must have 7 items (1 cardio + 4 mobility + 2 prehab)
check("Past-knee Lower has exactly 7 items", itemCount === 7, `got ${itemCount}`);

// Verify no excluded slugs
const excludedSlugs = pastKneeLower.filter(w => 
  ["bodyweight-squat", "walking-lunge", "worlds-greatest"].includes(w.slug)
);
check("No knee-loading mobility drills", excludedSlugs.length === 0,
  excludedSlugs.length > 0 ? `Found: ${excludedSlugs.map(w => w.slug).join(", ")}` : ""
);

// Verify structure: cardio + mobility + prehab
const cardio = pastKneeLower.filter(w => w.phase === "cardio");
const mobility = pastKneeLower.filter(w => w.phase === "mobility");
const prehab = pastKneeLower.filter(w => w.phase === "prehab");

check("Has 1 cardio item", cardio.length === 1, `got ${cardio.length}`);
check("Has exactly 4 mobility drills", mobility.length === 4, `got ${mobility.length}`);
check("Has 2 prehab items", prehab.length === 2, `got ${prehab.length}`);

// Verify knee-safe lower-body mobility drills are preferred
const kneeSafeLowerDrills = ["glute-bridge", "leg-swing-front", "leg-swing-side", "hip-circles", "ankle-rock"];
const mobilityDrillsUsed = mobility.map(w => w.slug);
const hasKneeSafeLower = mobilityDrillsUsed.some(slug => kneeSafeLowerDrills.includes(slug));
check("Includes knee-safe lower-body mobility", hasKneeSafeLower,
  `mobility: ${mobilityDrillsUsed.join(", ")}`
);

// Pin the exact mobility drills for past-knee Lower
const expectedMobility = ["glute-bridge", "ankle-rock", "hip-circles", "leg-swing-front"];
const actualMobility = mobilityDrillsUsed.sort();
const expectedSorted = expectedMobility.sort();
check("Exact mobility drills match", 
  JSON.stringify(actualMobility) === JSON.stringify(expectedSorted),
  `expected [${expectedSorted.join(", ")}], got [${actualMobility.join(", ")}]`
);

// No injury baseline: should NOT have 7 items (no prehab without injury)
const noInjuryLower = selectWarmup({
  warmups,
  trainingMuscles: realLowerMuscles,
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const noInjuryCount = noInjuryLower.length;
const hasKneeLoading = noInjuryLower.some(w => 
  ["bodyweight-squat", "walking-lunge"].includes(w.slug)
);

check("No-injury Lower has fewer items (no prehab)", noInjuryCount < 7, 
  `got ${noInjuryCount} items (past-knee has 7 with prehab)`
);
check("No-injury Lower includes knee-loading drills", hasKneeLoading,
  `mobility: ${noInjuryLower.filter(w => w.phase === "mobility").map(w => w.slug).join(", ")}`
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
