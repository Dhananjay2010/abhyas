/**
 * Past-knee warm-up exclusion test
 * 
 * Tests that users with past knee injuries (knee in prehabRegions but not in
 * injuryRegions) do not get knee-loading mobility drills (bodyweight-squat,
 * walking-lunge, worlds-greatest) in their warm-up.
 * 
 * npm run test:past-knee-warmup
 */
import { readFileSync, existsSync } from "node:fs";
import { selectWarmup, PAST_KNEE_EXCLUDED_WARMUP_SLUGS, type WarmupRow } from "../src/lib/program/warmup";

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

console.log("Past-knee warm-up exclusions\n");

// Test 1: Past-knee Lower day with all equipment
console.log("1. Past-knee Lower day (all equipment)");
const pastKneeAllEquip = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings", "calves"],
  injuryRegions: [], // No current injuries
  prehabRegions: ["knee"], // Past knee injury
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const excludedSlugsAllEquip = pastKneeAllEquip.filter(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("No excluded slugs (bodyweight-squat, walking-lunge, worlds-greatest)", 
  excludedSlugsAllEquip.length === 0,
  excludedSlugsAllEquip.length > 0 ? `Found: ${excludedSlugsAllEquip.map(w => w.slug).join(", ")}` : ""
);

const mobilityDrills = pastKneeAllEquip.filter(w => w.phase === "mobility");
check("At least 3 mobility drills", mobilityDrills.length >= 3, 
  `got ${mobilityDrills.length}: ${mobilityDrills.map(w => w.slug).join(", ")}`
);

const hasGluteBridge = pastKneeAllEquip.some(w => w.slug === "glute-bridge");
check("Glute bridge present (hip/hamstring overlap)", hasGluteBridge);

const kneePrehab = pastKneeAllEquip.filter(w => 
  w.phase === "prehab" && w.target_regions.includes("knee")
);
check("Knee prehab present (TKE or clamshell)", kneePrehab.length > 0,
  kneePrehab.length > 0 ? kneePrehab.map(w => w.slug).join(", ") : "none"
);

// Test 2: Past-knee Lower day with bodyweight only
console.log("\n2. Past-knee Lower day (bodyweight only)");
const pastKneeBWOnly = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings", "calves"],
  injuryRegions: [],
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: false,
  availableEquipment: new Set(["bodyweight", "yoga_mat"]),
});

const excludedSlugsBW = pastKneeBWOnly.filter(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("No excluded slugs (bodyweight only)", 
  excludedSlugsBW.length === 0,
  excludedSlugsBW.length > 0 ? `Found: ${excludedSlugsBW.map(w => w.slug).join(", ")}` : ""
);

const mobilityDrillsBW = pastKneeBWOnly.filter(w => w.phase === "mobility");
check("At least 3 mobility drills (bodyweight)", mobilityDrillsBW.length >= 3,
  `got ${mobilityDrillsBW.length}: ${mobilityDrillsBW.map(w => w.slug).join(", ")}`
);

// Test 3: Verify the constant is exported and correct
console.log("\n3. PAST_KNEE_EXCLUDED_WARMUP_SLUGS constant");
check("Constant includes bodyweight-squat", 
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has("bodyweight-squat")
);
check("Constant includes walking-lunge", 
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has("walking-lunge")
);
check("Constant includes worlds-greatest", 
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has("worlds-greatest")
);
check("Constant has exactly 3 slugs", 
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.size === 3,
  `got ${PAST_KNEE_EXCLUDED_WARMUP_SLUGS.size}`
);

// Test 4: Current knee injury should still exclude these (unchanged behavior)
console.log("\n4. Current knee injury (unchanged - excludes by target_regions)");
const currentKnee = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings"],
  injuryRegions: ["knee"], // Current injury
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const currentKneeExcluded = currentKnee.filter(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("Current knee also excludes these slugs", 
  currentKneeExcluded.length === 0,
  currentKneeExcluded.length > 0 ? `Found: ${currentKneeExcluded.map(w => w.slug).join(", ")}` : ""
);

// Test 5: No injury should allow these drills
console.log("\n5. No injury baseline (should allow excluded drills)");
const noInjury = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings"],
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

// We don't require them to appear, just that they're not excluded
const totalMobilityPool = warmups.filter(w => 
  w.type === "mobility" && 
  (w.equipment_ids?.length === 0 || !w.equipment_ids)
);
const hasExcludedInPool = totalMobilityPool.some(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("Excluded drills exist in mobility pool", hasExcludedInPool,
  "These should be available for users without past knee injury"
);

// Actually verify that at least one excluded drill appears in the no-injury warmup for Lower
// This catches the "apply exclusion to all users" mutant
const hasSomeExcludedDrill = noInjury.some(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("No-injury Lower warmup includes at least one excluded drill", hasSomeExcludedDrill,
  hasSomeExcludedDrill ? "" : "Should have bodyweight-squat, walking-lunge, or worlds-greatest"
);

// Test 5b: Specific test for fallback exclusion - use muscles that lead to < 3 mobility drills
console.log("\n5b. Fallback scenario (abs/obliques with no equipment)");
const fallbackScenario = selectWarmup({
  warmups,
  trainingMuscles: ["abs", "obliques"], // These have low mobility overlap
  injuryRegions: [],
  prehabRegions: ["knee"], // Past knee
  track: "weights",
  hasAllEquipment: false,
  availableEquipment: new Set(["bodyweight"]),
});

const mobilityInFallback = fallbackScenario.filter(w => w.phase === "mobility");
const hasBodyweightSquatFallback = mobilityInFallback.some(w => w.slug === "bodyweight-squat");
check("Fallback scenario still excludes bodyweight-squat for past-knee", 
  !hasBodyweightSquatFallback,
  hasBodyweightSquatFallback ? "bodyweight-squat should not appear in fallback" : ""
);
check("Fallback scenario has at least 3 mobility drills", 
  mobilityInFallback.length >= 3,
  `got ${mobilityInFallback.length}: ${mobilityInFallback.map(w => w.slug).join(", ")}`
);

// Test 5c: REAL fallback path test with minimal seed rows
console.log("\n5c. Fallback path with minimal seed subset (forces fallback)");
// Create a minimal warmup set: only easy-bike (cardio), cat-cow (mobility), 
// bodyweight-squat (mobility, knee-loading), and clamshell (prehab)
const minimalWarmups: WarmupRow[] = warmups.filter(w =>
  ["easy-bike", "cat-cow", "bodyweight-squat", "clamshell"].includes(w.slug)
);

// Past-knee user with quads training: cat-cow has no quad overlap, 
// bodyweight-squat does but is excluded, so we get cat-cow only (1 drill)
// then fallback tries to add: cat-cow (already there), arm-circles (missing),
// bodyweight-squat (excluded for past knee), hip-circles (missing)
const pastKneeFallback = selectWarmup({
  warmups: minimalWarmups,
  trainingMuscles: ["quads"], // Muscle with no overlap to cat-cow
  injuryRegions: [],
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const pastKneeMobility = pastKneeFallback.filter(w => w.phase === "mobility");
const hasBWSquatPastKnee = pastKneeMobility.some(w => w.slug === "bodyweight-squat");
check("Fallback path excludes bodyweight-squat for past-knee", 
  !hasBWSquatPastKnee,
  `Mobility: ${pastKneeMobility.map(w => w.slug).join(", ")}`
);

// No-injury user: should get bodyweight-squat in the result (proves fallback ran and added it)
const noInjuryFallback = selectWarmup({
  warmups: minimalWarmups,
  trainingMuscles: ["quads"],
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const noInjuryMobility = noInjuryFallback.filter(w => w.phase === "mobility");
const hasBWSquatNoInjury = noInjuryMobility.some(w => w.slug === "bodyweight-squat");
check("Fallback path includes bodyweight-squat for no-injury", 
  hasBWSquatNoInjury,
  `Mobility: ${noInjuryMobility.map(w => w.slug).join(", ")}`
);

// Test 6: Past knee + another region (e.g., past shoulder) should still exclude
console.log("\n6. Past knee + past shoulder (combined injuries)");
const pastKneePastShoulder = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "glutes", "hamstrings"],
  injuryRegions: [],
  prehabRegions: ["knee", "shoulder"], // Multiple past injuries
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

const excludedCombined = pastKneePastShoulder.filter(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("Past knee + past shoulder excludes knee-loading drills", 
  excludedCombined.length === 0,
  excludedCombined.length > 0 ? `Found: ${excludedCombined.map(w => w.slug).join(", ")}` : ""
);

// Test 7: Verify isPastKnee logic distinguishes current from past
console.log("\n7. Current knee vs past knee distinction");
// Current knee: should exclude through target_regions, NOT through isPastKnee path
const currentKneeCheck = selectWarmup({
  warmups,
  trainingMuscles: ["chest", "lats"], // Upper body
  injuryRegions: ["knee"], // Current knee
  prehabRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});

// For Upper body, none of the excluded drills should appear (they're lower-body mobility)
// But this is NOT because of isPastKnee logic; it's because they target knee region
const currentKneeHasExcluded = currentKneeCheck.some(w =>
  PAST_KNEE_EXCLUDED_WARMUP_SLUGS.has(w.slug)
);
check("Current knee Upper warmup has no knee-loading drills", 
  !currentKneeHasExcluded,
  "Excluded through target_regions, not isPastKnee"
);

// Now test that ONLY past knee (not current) triggers the isPastKnee path
// We can't directly test isPastKnee variable, but we can verify behavior difference:
// If the mutant "treats current knee as past knee", then the test cases should catch
// any change in output. The identity matrix test covers this for non-past-knee scenarios.

// Summary
console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
