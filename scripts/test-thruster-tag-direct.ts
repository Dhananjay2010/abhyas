#!/usr/bin/env npx tsx
/**
 * Direct test that kettlebell-thruster has the knee contraindication tag.
 * Killed by M5 mutant (removing knee tag from kettlebell-thruster).
 * 
 * WHY THIS TEST IS NEEDED:
 * kettlebell-thruster is ALSO in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS, so the
 * slug-based filter would still exclude it even without the tag. This test
 * ensures the catalogue data itself is correct for migration 000045, which
 * retaggs exercises so that tag-based filtering works independently.
 */

import { readFileSync } from "fs";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const thruster = catalogue.find((e: any) => e.slug === "kettlebell-thruster");

if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

if (!thruster.contraindicated_regions.includes("knee")) {
  console.error("✗ FAIL: kettlebell-thruster missing knee contraindication tag");
  console.error("  Current tags:", thruster.contraindicated_regions);
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster has knee contraindication tag");
