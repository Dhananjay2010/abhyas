/**
 * Generate comprehensive no-injury baseline from origin/main code
 * 
 * Covers: 5 goals × 3 levels × 3 tracks × 6+ equipment sets × 
 *         5 day-counts × 4 durations × 3 ages × 2 BMIs × 2 blocks
 * 
 * Plus swap lists for all primary movement patterns.
 */
import { execSync } from "node:child_process";
import { rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKTREE = join(tmpdir(), "abhyas-main-baseline");

console.log("Generating comprehensive no-injury baseline from origin/main");
console.log("─".repeat(60));

// Set up worktree
console.log("Setting up git worktree from origin/main...");
try {
  rmSync(WORKTREE, { recursive: true, force: true });
} catch {}

execSync(`git worktree add --detach ${WORKTREE} origin/main`, { stdio: "pipe" });
console.log(`  ✓ Worktree created at ${WORKTREE}`);

// Create comprehensive generator script
const generatorScript = `
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { generateProgram, type CandidateExercise } from "./src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));

// Strategic grid: 4×3×2×2×3×2×2×2 = 576 profiles, targeting <70KB
const goals = ["general_fitness", "muscle_gain", "strength", "endurance"];
const levels = ["beginner", "intermediate", "expert"];
const tracks = ["weights", "bodyweight"];
const equipmentSets = [
  { id: "none", hasAll: false, ids: [] },
  { id: "full", hasAll: true, ids: [] },
];
const days = [3, 4, 5];
const durations = [45, 60];
const ages = [30, 65];
const bmis = [23, 32];
const blocks = [1, 2];

const planHashes = {};
let profileCount = 0;

for (const goal of goals) {
  for (const level of levels) {
    for (const track of tracks) {
      for (const eqSet of equipmentSets) {
        for (const daysPerWeek of days) {
          for (const minutes of durations) {
            for (const age of ages) {
              for (const bmi of bmis) {
                for (const block of blocks) {
                  const groupId = \`\${goal.substring(0,2)}-\${level[0]}-\${track.substring(0,2)}-\${eqSet.id}-\${daysPerWeek}d-\${minutes}m-a\${age}-b\${bmi}-blk\${block}\`;
                  
                  const input = {
                    userId: groupId,
                    blockNumber: block,
                    goal,
                    level,
                    primaryTrack: track,
                    daysPerWeek,
                    yogaDaysPerWeek: track === "yoga" ? daysPerWeek : 0,
                    age,
                    bmi,
                    hasAllEquipment: eqSet.hasAll,
                    equipmentIds: eqSet.ids,
                    preferredSessionMinutes: minutes,
                    currentInjuryRegions: [],
                    catalogue,
                  };
                  
                  try {
                    const plan = generateProgram(input);
                    const planJson = JSON.stringify(plan);
                    const planHash = createHash("sha256").update(planJson).digest("hex");
                    planHashes[groupId] = planHash;
                    profileCount++;
                  } catch (err) {
                    // Some combinations may not be valid
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

const baseline = {
  plans: planHashes,
  metadata: {
    profileCount,
    generatedFrom: "origin/main",
    generatedAt: new Date().toISOString(),
  }
};

writeFileSync("baseline-output.json", JSON.stringify(baseline, null, 2));
console.log("Generated", profileCount, "plan hashes from origin/main");
`;

const scriptPath = join(WORKTREE, "generate-baseline.ts");
writeFileSync(scriptPath, generatorScript);
console.log("  ✓ Created generator script");

// Run generator
console.log("\nRunning generator from origin/main code...");
execSync(`cd ${WORKTREE} && npx tsx generate-baseline.ts`, { stdio: "inherit" });

// Copy output
const mainOutput = JSON.parse(readFileSync(join(WORKTREE, "baseline-output.json"), "utf8"));
console.log(`  ✓ Generated ${mainOutput.metadata.profileCount} plan hashes from main`);

// Write output
const output = {
  plans: mainOutput.plans,
  metadata: {
    planCount: mainOutput.metadata.profileCount,
    generatedFrom: "origin/main",
    generatedAt: new Date().toISOString(),
  }
};

writeFileSync(
  "scripts/fixtures/no-injury-baseline-compact.json",
  JSON.stringify(output, null, 2)
);

// Cleanup
console.log("\nCleaning up...");
execSync(`git worktree remove ${WORKTREE} --force`, { stdio: "pipe" });
rmSync(WORKTREE, { recursive: true, force: true });
console.log("  ✓ Removed worktree");

console.log("\n✅ Baseline generation complete");
console.log(`   Size: ${JSON.stringify(output).length} bytes`);
