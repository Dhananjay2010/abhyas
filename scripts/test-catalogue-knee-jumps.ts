/**
 * Catalogue Knee Jumps Test (PR #73 Run 20)
 * 
 * Verifies that all high-impact exercises in the catalogue have:
 * - impact: "high"
 * - contraindicated_regions includes "knee" (if it's a lower-body move)
 * 
 * This ensures the catalogue data is consistent with our knee safety rules.
 */

import { readFileSync } from "node:fs";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

console.log("Catalogue Knee Jumps Test");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// Find all high-impact exercises
const highImpact = catalogue.filter(e => e.impact === "high");
console.log(`Found ${highImpact.length} high-impact exercises\n`);

// Check that high-impact lower-body exercises are contraindicated for knee
const lowerBodyPatterns = ["squat", "lunge", "hinge", "single_leg"];
const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];

for (const ex of highImpact) {
  const isLowerBody = 
    lowerBodyPatterns.includes(ex.movement_pattern) ||
    ex.primary_muscles.some(m => lowerBodyMuscles.includes(m));
  
  if (isLowerBody) {
    check(
      `${ex.slug}: high-impact lower-body has knee contraindication`,
      ex.contraindicated_regions.includes("knee"),
      `High-impact lower-body exercise should be contraindicated for knee`
    );
  }
}

// Check jump/plyometric keywords
const jumpKeywords = ["jump", "box-jump", "plyometric", "plyo"];
for (const ex of catalogue) {
  const hasJumpKeyword = jumpKeywords.some(kw => 
    ex.slug.includes(kw) || ex.name.toLowerCase().includes(kw)
  );
  
  if (hasJumpKeyword) {
    check(
      `${ex.slug}: jump/plyometric exercise has high impact`,
      ex.impact === "high",
      `Jump/plyometric should have impact: "high"`
    );
  }
}

console.log("");
console.log("─".repeat(60));

if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log("PASSED: All catalogue knee/jump checks passed");
  process.exit(0);
}
