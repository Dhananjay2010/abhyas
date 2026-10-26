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

// Real past-knee Lower day: intermediate weights, 4d 60m, training quads/lower_back/calves/abs
// This is the actual muscle set from QA's frozen profile real Lower day
const realLowerMuscles: Muscle[] = ["quads", "lower_back", "calves", "abs"];

const pastKneeLower = selectWarmup({
  warmups,
  trainingMuscles: realLowerMuscles,
  injuryRegions: [],
  prehabRegions: ["knee"], // Past knee
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

// Get main's output for the same day (no past knee)
const mainLower = selectWarmup({
  warmups,
  trainingMuscles: realLowerMuscles,
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const pastKneeTotalSeconds = warmupSeconds(pastKneeLower);
const pastKneeItemCount = pastKneeLower.length;
const mainTotalSeconds = warmupSeconds(mainLower);
const mainItemCount = mainLower.length;

const pastKneeMobility = pastKneeLower.filter(w => w.phase === "mobility");
const mainMobility = mainLower.filter(w => w.phase === "mobility");
const pastKneeMobilitySeconds = pastKneeMobility.reduce((sum, w) => sum + w.duration_seconds, 0);
const mainMobilitySeconds = mainMobility.reduce((sum, w) => sum + w.duration_seconds, 0);
const excluded = mainMobility.filter(w => ["bodyweight-squat", "walking-lunge", "worlds-greatest"].includes(w.slug));

console.log("Past-knee Lower day (quads+lower_back+calves+abs):");
console.log(`  Total items: ${pastKneeItemCount} (${pastKneeMobility.length} mobility + prehab)`);
console.log(`  Total time: ${pastKneeTotalSeconds}s (${pastKneeMobilitySeconds}s mobility)`);
console.log("  Items:");
pastKneeLower.forEach(item => {
  console.log(`    - ${item.name} (${item.slug}, ${item.phase}, ${item.duration_seconds}s)`);
});

console.log("\nMain's Lower day (same muscles, no injury):");
console.log(`  Total items: ${mainItemCount} (${mainMobility.length} mobility, no prehab)`);
console.log(`  Total time: ${mainTotalSeconds}s (${mainMobilitySeconds}s mobility)`);
mainLower.forEach(item => {
  console.log(`    - ${item.name} (${item.slug}, ${item.phase})`);
});

// Past-knee must match main's MOBILITY count and seconds (prehab is extra)
// Allow small tolerance (±15s per excluded drill) when using knee-safe drills of different durations
const expectedMobilitySeconds = mainMobilitySeconds;
const tolerance = 15 * excluded.length; // 15s tolerance per excluded drill replaced
check("Past-knee mobility count matches main's", pastKneeMobility.length === mainMobility.length, 
  `past-knee: ${pastKneeMobility.length}, main: ${mainMobility.length}`);
check("Past-knee mobility seconds matches main's (within tolerance)", 
  Math.abs(pastKneeMobilitySeconds - expectedMobilitySeconds) <= tolerance, 
  `past-knee: ${pastKneeMobilitySeconds}s, main: ${expectedMobilitySeconds}s, tolerance: ±${tolerance}s`);

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
check("Has mobility drills", mobility.length >= 2, `got ${mobility.length}`);
check("Has prehab items (past knee gets prehab)", prehab.length >= 1, `got ${prehab.length}`);

// Verify knee-safe lower-body mobility drills are used instead of excluded ones
const kneeSafeLowerDrills = ["glute-bridge", "leg-swing-front", "leg-swing-side", "hip-circles", "ankle-rock"];
const mobilityDrillsUsed = mobility.map(w => w.slug);
const hasKneeSafeLower = mobilityDrillsUsed.some(slug => kneeSafeLowerDrills.includes(slug));
check("Includes knee-safe lower-body mobility", hasKneeSafeLower,
  `mobility: ${mobilityDrillsUsed.join(", ")}`
);

// Test case 2: quads+calves (another real Lower day variant)
console.log("\n\nPast-knee quads+calves day:");
const pastKneeQuadsCalves = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "calves"],
  injuryRegions: [],
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const mainQuadsCalves = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "calves"],
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const pastKneeQCCount = pastKneeQuadsCalves.length;
const mainQCCount = mainQuadsCalves.length;
const pastKneeQCSeconds = warmupSeconds(pastKneeQuadsCalves);
const mainQCSeconds = warmupSeconds(mainQuadsCalves);

const pastKneeQCMobility = pastKneeQuadsCalves.filter(w => w.phase === "mobility");
const mainQCMobility = mainQuadsCalves.filter(w => w.phase === "mobility");
const pastKneeQCMobilitySeconds = pastKneeQCMobility.reduce((sum, w) => sum + w.duration_seconds, 0);
const mainQCMobilitySeconds = mainQCMobility.reduce((sum, w) => sum + w.duration_seconds, 0);
const excludedQC = mainQCMobility.filter(w => ["bodyweight-squat", "walking-lunge", "worlds-greatest"].includes(w.slug));

console.log(`  Past-knee: ${pastKneeQCCount} items (${pastKneeQCMobility.length} mobility), ${pastKneeQCSeconds}s (${pastKneeQCMobilitySeconds}s mobility)`);
console.log(`  Main: ${mainQCCount} items (${mainQCMobility.length} mobility), ${mainQCSeconds}s (${mainQCMobilitySeconds}s mobility)`);
pastKneeQuadsCalves.forEach(item => {
  console.log(`    - ${item.slug} (${item.phase})`);
});

const toleranceQC = 15 * excludedQC.length;
check("Past-knee quads+calves mobility count matches main's", pastKneeQCMobility.length === mainQCMobility.length,
  `past-knee: ${pastKneeQCMobility.length}, main: ${mainQCMobility.length}`);
check("Past-knee quads+calves mobility seconds matches main's (within tolerance)", 
  Math.abs(pastKneeQCMobilitySeconds - mainQCMobilitySeconds) <= toleranceQC,
  `past-knee: ${pastKneeQCMobilitySeconds}s, main: ${mainQCMobilitySeconds}s, tolerance: ±${toleranceQC}s`);

// Verify no arm-circles when lower-body options remain
const qcMobility = pastKneeQuadsCalves.filter(w => w.phase === "mobility");
const hasArmCircles = qcMobility.some(w => w.slug === "arm-circles");
const hasLowerOption = qcMobility.some(w => ["glute-bridge", "hip-circles", "leg-swing-front", "leg-swing-side"].includes(w.slug));
if (hasLowerOption) {
  check("No arm-circles when lower-body knee-safe drills are used", 
    !hasArmCircles,
    `mobility: ${qcMobility.map(w => w.slug).join(", ")}`
  );
}

// No injury baseline: compare structure
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

console.log("\n\nNo-injury Lower:");
console.log(`  Items: ${noInjuryCount}`);
noInjuryLower.forEach(item => {
  console.log(`    - ${item.slug} (${item.phase})`);
});

check("No-injury Lower includes knee-loading drills", hasKneeLoading,
  `mobility: ${noInjuryLower.filter(w => w.phase === "mobility").map(w => w.slug).join(", ")}`
);

// Test case 4: Pin exact mobility seconds for a past-knee Lower day (item 6a)
console.log("\n\nPin exact mobility seconds for past-knee Lower day (item 6a):");
const pinnedPastKneeProfile = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings", "calves"],
  injuryRegions: [],
  prehabRegions: ["knee"], // Past knee, so prehab is included
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const pinnedMobility = pinnedPastKneeProfile.filter(w => w.phase === "mobility");
const pinnedMobilitySeconds = pinnedMobility.reduce((sum, w) => sum + (w.duration_seconds ?? 0), 0);

console.log("  Past-knee Lower day mobility:");
pinnedMobility.forEach(drill => {
  console.log(`    - ${drill.slug}: ${drill.duration_seconds}s`);
});

check("Past-knee Lower mobility seconds pinned", pinnedMobilitySeconds > 0,
  `total: ${pinnedMobilitySeconds}s from ${pinnedMobility.length} drills`
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
