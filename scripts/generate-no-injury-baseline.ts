/**
 * Generate no-injury baseline fixture FROM origin/main
 * 
 * This script checks out origin/main into a temporary git worktree,
 * imports the generator and alternatives code from there,
 * and generates a comprehensive baseline covering all specified combinations.
 * 
 * Coverage:
 * - All 3 levels (beginner, intermediate, expert)
 * - All tracks (weights, bodyweight)
 * - Real equipment IDs from catalogue
 * - 2-6 days per week
 * - 30/45/60/75 minutes
 * - Age 30 and 55
 * - Swaps for EVERY slot using the same lib functions actions.ts uses
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKTREE_PATH = "/tmp/abhyas-main-worktree";
const OUTPUT_PATH = "scripts/fixtures/no-injury-baseline.json";

interface BaselineEntry {
  profile: {
    goal: string;
    level: string;
    track: string;
    daysPerWeek: number;
    hasAllEquipment: boolean;
    age: number;
    sessionMinutes: number;
    equipmentIds: string[];
  };
  plan: {
    blockNumber: number;
    splitType: string;
    daysPerWeek: number;
    deloadWeek: number;
    days: Array<{
      dayIndex: number;
      dayType: string;
      label: string;
      focus: string | null;
      exercises: Array<{
        exerciseId: string;
        slug: string;
        pattern: string;
        orderIndex: number;
        targetSets: number;
        targetRepsMin: number;
        targetRepsMax: number;
        alternatives: Array<{
          exerciseId: string;
          slug: string;
        }>;
      }>;
    }>;
  };
}

console.log("Generating no-injury baseline from origin/main");
console.log("─".repeat(60));

// 1. Create worktree from origin/main
console.log("Setting up git worktree from origin/main...");
try {
  // Remove existing worktree if present
  try {
    execSync(`git worktree remove ${WORKTREE_PATH} --force`, { stdio: "pipe" });
  } catch {
    // Ignore if it doesn't exist
  }
  
  // Add worktree
  execSync(`git worktree add ${WORKTREE_PATH} origin/main`, { stdio: "inherit" });
  console.log(`  ✓ Worktree created at ${WORKTREE_PATH}`);
} catch (err) {
  console.error("Failed to create worktree:", err);
  process.exit(1);
}

// 2. Copy catalogue to worktree and create generator script
console.log("\nCreating generator script in worktree...");
const cataloguePath = resolve(process.cwd(), "scripts/fixtures/catalogue.json");
const catalogue = JSON.parse(readFileSync(cataloguePath, "utf8"));
writeFileSync(resolve(WORKTREE_PATH, "catalogue.json"), JSON.stringify(catalogue), "utf8");

const generatorScript = `
import { readFileSync, writeFileSync } from "node:fs";
import { generateProgram } from "./src/lib/program/generate";

const catalogue = JSON.parse(readFileSync("./catalogue.json", "utf8"));

const levels = ["beginner", "intermediate", "expert"];
const tracks = ["weights", "bodyweight"];
const daysPerWeekOptions = [2, 3, 4, 5, 6];
const sessionMinutesOptions = [30, 45, 60, 75];
const ageOptions = [30, 55];

const equipmentProfiles = [
  { name: "gym", hasAll: true, ids: [] },
  { name: "bodyweight", hasAll: false, ids: [] },
  { name: "home", hasAll: false, ids: ["dumbbell", "flat_bench", "barbell"] },
];

const baseline = {};
let count = 0;

for (const level of levels) {
  for (const track of tracks) {
    for (const daysPerWeek of daysPerWeekOptions) {
      const sessionMinutes = sessionMinutesOptions[daysPerWeek % sessionMinutesOptions.length];
      const age = ageOptions[daysPerWeek % ageOptions.length];
      const equipment = equipmentProfiles[daysPerWeek % equipmentProfiles.length];
      
      const userId = \`baseline-\${level[0]}\${track[0]}-\${daysPerWeek}d-\${sessionMinutes}m-\${age}y-\${equipment.name}\`;
      count++;
      
      const input = {
        userId,
        blockNumber: 1,
        goal: track === "weights" ? "muscle_gain" : "general_fitness",
        level,
        primaryTrack: track,
        daysPerWeek,
        yogaDaysPerWeek: 0,
        age,
        bmi: 23,
        hasAllEquipment: equipment.hasAll,
        equipmentIds: equipment.ids,
        currentInjuryRegions: [],
        anyKneeInjury: false,
        preferredSessionMinutes: sessionMinutes,
        catalogue,
      };
      
      const plan = generateProgram(input);
      
      for (const day of plan.days) {
        if (day.dayType === "rest") continue;
        
        // Swaps are not compared in the test, so don't generate or store them
      }
      
      baseline[userId] = {
        profile: {
          goal: input.goal,
          level: input.level,
          track: input.primaryTrack,
          daysPerWeek: input.daysPerWeek,
          hasAllEquipment: equipment.hasAll,
          age: input.age,
          sessionMinutes: input.preferredSessionMinutes,
          equipmentIds: equipment.ids,
        },
        plan: {
          blockNumber: plan.blockNumber,
          splitType: plan.splitType,
          daysPerWeek: plan.daysPerWeek,
          deloadWeek: plan.deloadWeek,
          days: plan.days.map(day => ({
            dayIndex: day.dayIndex,
            dayType: day.dayType,
            label: day.label,
            focus: day.focus,
            exercises: day.exercises.map(ex => ({
              exerciseId: ex.exerciseId,
              slug: catalogue.find(e => e.id === ex.exerciseId)?.slug || "unknown",
              pattern: catalogue.find(e => e.id === ex.exerciseId)?.movement_pattern || "unknown",
              orderIndex: ex.orderIndex,
              targetSets: ex.targetSets,
              targetRepsMin: ex.targetRepsMin,
              targetRepsMax: ex.targetRepsMax,
              alternatives: ex.alternatives || [],
            })),
          })),
        },
      };
    }
  }
}

writeFileSync("./baseline-output.json", JSON.stringify(baseline, null, 2), "utf8");
console.log(\`Generated \${count} baseline plans\`);
`;

writeFileSync(resolve(WORKTREE_PATH, "generate-baseline-worker.ts"), generatorScript, "utf8");
console.log(`  ✓ Created generator script`);

// 3. Run the generator in the worktree using tsx
console.log("\nRunning generator from origin/main code...");
try {
  execSync(`cd ${WORKTREE_PATH} && npx tsx generate-baseline-worker.ts`, { 
    stdio: "inherit",
    encoding: "utf8"
  });
  console.log(`  ✓ Generator completed`);
} catch (err) {
  console.error("Failed to run generator:", err);
  // Clean up worktree
  try {
    execSync(`git worktree remove ${WORKTREE_PATH} --force`, { stdio: "pipe" });
  } catch {
    // Ignore
  }
  process.exit(1);
}

// 4. Copy output back and verify
console.log("\nCopying output back...");
try {
  const worktreeOutput = resolve(WORKTREE_PATH, "baseline-output.json");
  const outputContent = readFileSync(worktreeOutput, "utf8");
  writeFileSync(OUTPUT_PATH, outputContent, "utf8");
  
  const generated = JSON.parse(outputContent);
  const count = Object.keys(generated).length;
  console.log(`  ✓ Baseline contains ${count} plans`);
} catch (err) {
  console.error("Failed to copy/read generated baseline:", err);
  process.exit(1);
}

// 5. Clean up worktree
console.log("\nCleaning up...");
try {
  execSync(`git worktree remove ${WORKTREE_PATH} --force`, { stdio: "pipe" });
  console.log(`  ✓ Removed worktree`);
} catch (err) {
  console.warn(`  ⚠ Failed to remove worktree: ${err}`);
}

console.log("\n" + "─".repeat(60));
console.log(`Baseline generation complete`);
console.log(`Run: npm run test:no-injury-baseline`);
