#!/usr/bin/env tsx
/**
 * Analyze the impact of tag-based knee contraindication on past-knee users.
 * 
 * Main behavior: contraindicated_regions=["knee"] excluded only for CURRENT knee injuries
 * PR behavior: contraindicated_regions=["knee"] excludes for BOTH current AND past knee injuries
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));

// Find all knee-contraindicated exercises
const kneeContraindicated = catalogue.filter((ex: any) => 
  ex.contraindicated_regions?.includes("knee")
);

console.log("=".repeat(80));
console.log("KNEE-CONTRAINDICATED EXERCISES IN CATALOGUE");
console.log("=".repeat(80));
console.log("");
console.log(`Total: ${kneeContraindicated.length} exercises`);
console.log("");

// Get past-knee excluded slugs from main
const mainPastKneeFile = execSync("git show c3662dce:src/lib/program/past-knee.ts", { encoding: "utf8" });
const pastKneeExcludedMatch = mainPastKneeFile.match(/PAST_KNEE_EXCLUDED_SLUGS[^=]+=\s*new Set\(\[([^\]]+)\]/s);
let mainPastKneeExcluded: Set<string> = new Set();

if (pastKneeExcludedMatch) {
  const content = pastKneeExcludedMatch[1];
  const slugs = content.match(/"([^"]+)"/g);
  if (slugs) {
    mainPastKneeExcluded = new Set(slugs.map(s => s.replace(/"/g, '')));
  }
}

console.log("MAIN BRANCH BEHAVIOR:");
console.log("-".repeat(80));
console.log(`Past-knee explicit exclusions: ${mainPastKneeExcluded.size} exercises`);
console.log(`  (in PAST_KNEE_EXCLUDED_SLUGS set)`);
console.log("");

// Now check which knee-contraindicated exercises were NOT in the explicit exclusion list
const newlyExcluded = kneeContraindicated.filter((ex: any) => 
  !mainPastKneeExcluded.has(ex.slug)
);

console.log("PR BRANCH CHANGES:");
console.log("-".repeat(80));
console.log(`Newly excluded for past-knee users: ${newlyExcluded.length} exercises`);
console.log("");
console.log("These exercises have contraindicated_regions=[\"knee\"] but were NOT in");
console.log("PAST_KNEE_EXCLUDED_SLUGS on main, so they WERE available for past-knee users.");
console.log("The new tag-based check now excludes them:");
console.log("");

for (const ex of newlyExcluded) {
  const pattern = ex.movement_pattern || "unknown";
  const tags = ex.tags?.join(", ") || "none";
  console.log(`  ${ex.slug}`);
  console.log(`    Name: ${ex.name}`);
  console.log(`    Pattern: ${pattern}`);
  console.log(`    Tags: ${tags}`);
  console.log("");
}

console.log("=".repeat(80));
console.log("VERDICT:");
console.log("=".repeat(80));
console.log("");

if (newlyExcluded.length > 0) {
  console.log(`✗ ${newlyExcluded.length} exercises were REMOVED from past-knee users by this PR.`);
  console.log("");
  console.log("Notable exercises include:");
  const notable = ["barbell-squat", "front-squat", "dumbbell-squat", "goblet-squat", "box-squat"];
  for (const slug of notable) {
    const ex = newlyExcluded.find((e: any) => e.slug === slug);
    if (ex) {
      console.log(`  • ${ex.name} (${ex.slug})`);
    }
  }
  console.log("");
  console.log("This is a MATERIAL CHANGE that requires owner approval.");
  console.log("The previous claim that 'zero exercises changed' was INCORRECT.");
} else {
  console.log("✓ All knee-contraindicated exercises were already excluded on main.");
  console.log("The tag-based check is defense-in-depth, not a material change.");
}

console.log("");
console.log("=".repeat(80));

process.exit(newlyExcluded.length > 0 ? 1 : 0);
