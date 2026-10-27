#!/usr/bin/env npx tsx
/**
 * Sweep test: verify current-knee KB filtering across full grid
 * Tests that no current-knee plans contain current-tier banned slugs
 * and no past-knee plans contain past-tier banned slugs
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { getKneeBannedSlugs } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const injuries = ["nk", "pk", "pk_lbc", "pk_shc", "ck"] as const;
const equipment = ["all", "db+bench", "kb-only", "barbell+rack+bench", "bodyweight"] as const;
const levels = ["beginner", "intermediate", "expert"] as const;
const daysList = [2, 3, 4, 5, 6] as const;
const minutesList = [30, 45, 60, 75, 90] as const;
const goals = ["muscle_gain", "strength"] as const;

let totalProfiles = 0;
let ckKbProfiles = 0;
const leakyProfiles: Array<{ profile: string; leaks: string[] }> = [];

console.log("=".repeat(80));
console.log("CURRENT-KNEE KB SWEEP TEST");
console.log("=".repeat(80));
console.log("");

const currentTierBans = getKneeBannedSlugs("current");
const pastTierBans = getKneeBannedSlugs("past");

console.log(`Current-tier bans: ${currentTierBans.size} slugs`);
console.log(`Past-tier bans: ${pastTierBans.size} slugs`);
console.log("");

for (const injury of injuries) {
  const anyKneeInjury = injury !== "nk";
  const currentInjuryRegions: Array<"neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle" | "core"> = [];
  
  if (injury === "ck") {
    currentInjuryRegions.push("knee");
  } else if (injury === "pk_lbc") {
    currentInjuryRegions.push("lower_back");
  } else if (injury === "pk_shc") {
    currentInjuryRegions.push("shoulder");
  }
  
  for (const equip of equipment) {
    for (const level of levels) {
      for (const days of daysList) {
        for (const minutes of minutesList) {
          for (const goal of goals) {
            let hasAllEquipment = false;
            let equipmentIds: string[] = [];
            
            if (equip === "all") {
              hasAllEquipment = true;
            } else if (equip === "db+bench") {
              equipmentIds = ["dumbbell", "bench"];
            } else if (equip === "kb-only") {
              equipmentIds = ["kettlebell"];
            } else if (equip === "barbell+rack+bench") {
              equipmentIds = ["barbell", "squat-rack", "bench"];
            }
            
            const input: GeneratorInput = {
              userId: "sweep-test",
              blockNumber: 1,
              goal,
              level,
              primaryTrack: equip === "bodyweight" ? "bodyweight" : "weights",
              daysPerWeek: days,
              yogaDaysPerWeek: 0,
              age: 30,
              bmi: 23,
              hasAllEquipment,
              equipmentIds,
              currentInjuryRegions,
              anyKneeInjury,
              preferredSessionMinutes: minutes,
              catalogue,
            };
            
            totalProfiles++;
            
            const program = generateProgram(input);
            const allSlugs = new Set<string>();
            
            for (const day of program.days) {
              for (const ex of day.exercises) {
                if ('slug' in ex && typeof ex.slug === 'string') {
                  allSlugs.add(ex.slug);
                }
              }
            }
            
            // Check for leaks
            const leaks: string[] = [];
            const bannedSlugs = injury === "ck" ? currentTierBans : injury.startsWith("pk") ? pastTierBans : new Set();
            
            for (const slug of allSlugs) {
              if (bannedSlugs.has(slug)) {
                leaks.push(slug);
              }
            }
            
            if (leaks.length > 0) {
              const profileId = `${injury}-${equip}-${level}-${days}d-${minutes}m-${goal}`;
              leakyProfiles.push({ profile: profileId, leaks });
            }
            
            if (injury === "ck" && equip === "kb-only") {
              ckKbProfiles++;
            }
          }
        }
      }
    }
  }
}

console.log(`Total profiles: ${totalProfiles}`);
console.log(`Current-knee KB profiles: ${ckKbProfiles}`);
console.log("");

if (leakyProfiles.length > 0) {
  console.log(`✗ FAIL: ${leakyProfiles.length} profiles contain banned exercises`);
  console.log("");
  for (const { profile, leaks } of leakyProfiles.slice(0, 10)) {
    console.log(`  ${profile}: ${leaks.join(", ")}`);
  }
  if (leakyProfiles.length > 10) {
    console.log(`  ... and ${leakyProfiles.length - 10} more`);
  }
  process.exit(1);
} else {
  console.log("✓ PASS: 0 current-knee plans with current-tier slugs");
  console.log("✓ PASS: 0 past-knee plans with past-tier slugs");
  process.exit(0);
}
