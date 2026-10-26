#!/usr/bin/env tsx
/**
 * Compare main c3662dce vs current PR for all 900 past-knee profiles.
 * 
 * Strategy:
 * 1. Save current PR state
 * 2. Check out main c3662dce, run generation, save results
 * 3. Check out PR, run generation, save results
 * 4. Compare and report differences
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const MAIN_SHA = "c3662dce";
const RESULTS_DIR = "/tmp/knee-profile-comparison";

type ProfileConfig = {
  experience: "beginner" | "intermediate" | "advanced";
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  equipment: "minimal" | "standard" | "full";
  split: "ppl" | "upper_lower" | "full_body";
};

function generateAllProfiles(): ProfileConfig[] {
  const experiences: Array<"beginner" | "intermediate" | "advanced"> = ["beginner", "intermediate", "advanced"];
  const weekdays: Array<0 | 1 | 2 | 3 | 4 | 5 | 6> = [0, 1, 2, 3, 4, 5, 6];
  const equipments: Array<"minimal" | "standard" | "full"> = ["minimal", "standard", "full"];
  const splits: Array<"ppl" | "upper_lower" | "full_body"> = ["ppl", "upper_lower", "full_body"];

  const profiles: ProfileConfig[] = [];
  for (const experience of experiences) {
    for (const weekday of weekdays) {
      for (const equipment of equipments) {
        for (const split of splits) {
          profiles.push({ experience, weekday, equipment, split });
        }
      }
    }
  }
  return profiles;
}

// Create helper script that will be called from both main and PR
const helperScript = `
import { generateProgram } from "./src/lib/program/generate";
import { CATALOGUE } from "./src/lib/program/catalogue";
import { readFileSync, writeFileSync } from "fs";

const profiles = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outputPath = process.argv[3];

const results: any[] = [];

for (const profile of profiles) {
  const program = generateProgram({
    experience: profile.experience,
    equipment: profile.equipment,
    split: profile.split,
    weekday: profile.weekday,
    currentKneeInjury: false,
    pastKneeInjury: true,
    currentLowerBackInjury: false,
    pastLowerBackInjury: false,
    currentShoulderInjury: false,
    pastShoulderInjury: false,
  });

  const exercises: any[] = [];
  for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
    const day = program.days[dayIdx];
    if (day.type === "rest") continue;

    for (let slotIdx = 0; slotIdx < day.slots.length; slotIdx++) {
      const slot = day.slots[slotIdx];
      exercises.push({
        day: dayIdx,
        slot: slotIdx,
        slug: slot.exercise_slug,
        sets: slot.sets,
        reps: slot.reps,
        rest: slot.rest_seconds,
        warmup: slot.warmup_drills || [],
      });
    }
  }

  results.push({
    profile,
    exercises,
  });
}

writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(\`Generated \${results.length} profiles\`);
`;

async function main() {
  console.log("Setting up comparison...");
  
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Save current branch
  const currentBranch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
  console.log(`Current branch: ${currentBranch}`);

  // Generate all profile configs
  const profiles = generateAllProfiles();
  console.log(`Total profiles to test: ${profiles.length}`);
  
  const profilesPath = path.join(RESULTS_DIR, "profiles.json");
  writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));

  // Save helper script to workspace
  const helperPath = "/workspace/.generate-helper-temp.ts";
  writeFileSync(helperPath, helperScript);

  // Generate main results
  console.log("");
  console.log(`Checking out main @ ${MAIN_SHA}...`);
  execSync(`git checkout ${MAIN_SHA}`, { stdio: "inherit" });
  
  console.log("Generating programs on main...");
  const mainResultsPath = path.join(RESULTS_DIR, "main-results.json");
  execSync(`cd /workspace && npx tsx .generate-helper-temp.ts ${profilesPath} ${mainResultsPath}`, { stdio: "inherit" });

  // Generate PR results
  console.log("");
  console.log(`Checking out ${currentBranch}...`);
  execSync(`git checkout ${currentBranch}`, { stdio: "inherit" });
  
  console.log("Generating programs on PR...");
  const prResultsPath = path.join(RESULTS_DIR, "pr-results.json");
  execSync(`cd /workspace && npx tsx .generate-helper-temp.ts ${profilesPath} ${prResultsPath}`, { stdio: "inherit" });

  // Compare results
  console.log("");
  console.log("=".repeat(80));
  console.log("COMPARISON RESULTS");
  console.log("=".repeat(80));
  console.log("");

  const mainResults = JSON.parse(readFileSync(mainResultsPath, "utf8"));
  const prResults = JSON.parse(readFileSync(prResultsPath, "utf8"));

  // Track changes
  const slugChanges = new Map<string, { added: number; removed: number }>();
  const fieldChanges = {
    exerciseChanged: 0,
    setsChanged: 0,
    repsChanged: 0,
    restChanged: 0,
    warmupChanged: 0,
    orderChanged: 0,
  };

  let profilesWithDiff = 0;
  const detailedDiffs: any[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const mainExercises = mainResults[i].exercises;
    const prExercises = prResults[i].exercises;

    let hasDiff = false;

    // Compare lengths first
    if (mainExercises.length !== prExercises.length) {
      hasDiff = true;
    }

    // Build maps for comparison
    const mainByKey = new Map<string, any>();
    const prByKey = new Map<string, any>();

    for (const ex of mainExercises) {
      const key = `${ex.day}-${ex.slot}`;
      mainByKey.set(key, ex);
    }

    for (const ex of prExercises) {
      const key = `${ex.day}-${ex.slot}`;
      prByKey.set(key, ex);
    }

    // Compare each slot
    const allKeys = new Set([...mainByKey.keys(), ...prByKey.keys()]);
    const profileDiff: any = {
      profile: profiles[i],
      changes: [],
    };

    for (const key of allKeys) {
      const mainEx = mainByKey.get(key);
      const prEx = prByKey.get(key);

      if (!mainEx && prEx) {
        // Exercise added
        hasDiff = true;
        profileDiff.changes.push({
          type: "added",
          key,
          exercise: prEx.slug,
        });
        
        const count = slugChanges.get(prEx.slug) || { added: 0, removed: 0 };
        count.added++;
        slugChanges.set(prEx.slug, count);
      } else if (mainEx && !prEx) {
        // Exercise removed
        hasDiff = true;
        profileDiff.changes.push({
          type: "removed",
          key,
          exercise: mainEx.slug,
        });
        
        const count = slugChanges.get(mainEx.slug) || { added: 0, removed: 0 };
        count.removed++;
        slugChanges.set(mainEx.slug, count);
      } else if (mainEx && prEx) {
        // Compare fields
        const changes: string[] = [];
        
        if (mainEx.slug !== prEx.slug) {
          changes.push("exercise");
          fieldChanges.exerciseChanged++;
          
          const mainCount = slugChanges.get(mainEx.slug) || { added: 0, removed: 0 };
          mainCount.removed++;
          slugChanges.set(mainEx.slug, mainCount);
          
          const prCount = slugChanges.get(prEx.slug) || { added: 0, removed: 0 };
          prCount.added++;
          slugChanges.set(prEx.slug, prCount);
        }
        
        if (mainEx.sets !== prEx.sets) {
          changes.push("sets");
          fieldChanges.setsChanged++;
        }
        
        if (mainEx.reps !== prEx.reps) {
          changes.push("reps");
          fieldChanges.repsChanged++;
        }
        
        if (mainEx.rest !== prEx.rest) {
          changes.push("rest");
          fieldChanges.restChanged++;
        }
        
        const mainWarmup = JSON.stringify(mainEx.warmup || []);
        const prWarmup = JSON.stringify(prEx.warmup || []);
        if (mainWarmup !== prWarmup) {
          changes.push("warmup");
          fieldChanges.warmupChanged++;
        }

        if (changes.length > 0) {
          hasDiff = true;
          profileDiff.changes.push({
            type: "modified",
            key,
            fields: changes,
            main: mainEx,
            pr: prEx,
          });
        }
      }
    }

    if (hasDiff) {
      profilesWithDiff++;
      detailedDiffs.push(profileDiff);
    }
  }

  // Report results
  console.log(`Total profiles analyzed: ${profiles.length}`);
  console.log(`Profiles with differences: ${profilesWithDiff}`);
  console.log("");

  console.log("PER-SLUG CHANGES:");
  console.log("-".repeat(80));
  
  const sortedSlugs = Array.from(slugChanges.entries()).sort((a, b) => {
    const aTotal = Math.abs(a[1].added - a[1].removed);
    const bTotal = Math.abs(b[1].added - b[1].removed);
    return bTotal - aTotal;
  });

  for (const [slug, counts] of sortedSlugs) {
    if (counts.added > 0 || counts.removed > 0) {
      console.log(`  ${slug}:`);
      if (counts.removed > 0) console.log(`    REMOVED: ${counts.removed} occurrences`);
      if (counts.added > 0) console.log(`    ADDED: ${counts.added} occurrences`);
    }
  }

  console.log("");
  console.log("PER-FIELD CHANGES:");
  console.log("-".repeat(80));
  console.log(`  Exercise changed: ${fieldChanges.exerciseChanged} slots`);
  console.log(`  Sets changed: ${fieldChanges.setsChanged} slots`);
  console.log(`  Reps changed: ${fieldChanges.repsChanged} slots`);
  console.log(`  Rest changed: ${fieldChanges.restChanged} slots`);
  console.log(`  Warmup changed: ${fieldChanges.warmupChanged} slots`);

  // Save detailed diffs
  const diffPath = path.join(RESULTS_DIR, "detailed-diffs.json");
  writeFileSync(diffPath, JSON.stringify(detailedDiffs, null, 2));
  console.log("");
  console.log(`Detailed diffs saved to: ${diffPath}`);

  // Show sample diffs
  if (detailedDiffs.length > 0) {
    console.log("");
    console.log("SAMPLE DIFFERENCES (first 5):");
    console.log("-".repeat(80));
    
    for (const diff of detailedDiffs.slice(0, 5)) {
      console.log("");
      console.log(`Profile: ${JSON.stringify(diff.profile)}`);
      for (const change of diff.changes.slice(0, 3)) {
        if (change.type === "removed") {
          console.log(`  ${change.key}: REMOVED ${change.exercise}`);
        } else if (change.type === "added") {
          console.log(`  ${change.key}: ADDED ${change.exercise}`);
        } else {
          console.log(`  ${change.key}: ${change.fields.join(", ")} changed`);
          if (change.fields.includes("exercise")) {
            console.log(`    main: ${change.main.slug}`);
            console.log(`    pr: ${change.pr.slug}`);
          }
        }
      }
    }
  }

  console.log("");
  console.log("=".repeat(80));
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
