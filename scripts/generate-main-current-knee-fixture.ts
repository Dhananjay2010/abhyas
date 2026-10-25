#!/usr/bin/env tsx
/**
 * Generate scripts/fixtures/main-current-knee-swaps.json
 * 
 * Captures main's findAlternatives output for current-injury profiles (no
 * past knee) to prove that PR #124 only removes exercises (subset), never adds.
 *
 * Run ON A MAIN CHECKOUT (with scripts/helpers/{fake-swap-db,server-action-stubs,swap-scenario}.ts
 * copied in): npx tsx scripts/generate-main-current-knee-fixture.ts
 */
import { writeFileSync } from "node:fs";
import { installServerActionStubs } from "./helpers/server-action-stubs";
import {
  buildDb, activateDb, CATALOGUE, SLOT_ID,
  type Account,
} from "./helpers/swap-scenario";

const CURRENT_KNEE_PROFILES: Array<{ name: string; account: Account }> = [
  { name: "Current knee, intermediate, home", account: { level: "intermediate", equipment: ["dumbbell", "adjustable_bench", "pull_up_bar"], injuries: [{ body_region: "knee", severity: "current" }] } },
  { name: "Current shoulder, beginner, bodyweight", account: { level: "beginner", equipment: [], injuries: [{ body_region: "shoulder", severity: "current" }] } },
  { name: "Current wrist, expert, gym", account: { level: "expert", equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine"], injuries: [{ body_region: "wrist", severity: "current" }] } },
  { name: "Current knee, expert, full gym", account: { level: "expert", equipment: ["barbell", "dumbbell", "kettlebell", "flat_bench", "adjustable_bench", "squat_rack", "pull_up_bar", "cable_machine", "machine_generic", "medicine_ball"], injuries: [{ body_region: "knee", severity: "current" }] } },
];

async function main() {
  installServerActionStubs();
  const { findAlternatives } = await import("../src/app/session/actions");

  const currents = CATALOGUE.filter((e) => e.movement_pattern);
  const result: Record<string, Record<string, string[]>> = {};

  for (const { name, account } of CURRENT_KNEE_PROFILES) {
    result[name] = {};
    for (const current of currents) {
      const sibling = currents.find((e) => e.id !== current.id && e.movement_pattern === current.movement_pattern);
      const db = buildDb({ account, current, exercises: CATALOGUE, siblings: sibling ? [sibling] : [] });
      activateDb(db);
      const res = await findAlternatives(SLOT_ID);
      if (res.ok) {
        result[name][current.slug] = res.data.map((a) => a.exerciseId).sort();
      }
    }
  }

  const output = {
    _comment: "Generated from main 93b31724 with scripts/generate-main-current-knee-fixture.ts (run on a main checkout)",
    _note: "This fixture captures main's findAlternatives output for current-knee profiles. PR #124 must only remove exercises (subset), never add.",
    _sourceCommit: "93b31724",
    profiles: result,
  };

  writeFileSync("scripts/fixtures/main-current-knee-swaps.json", JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log("✓ Wrote scripts/fixtures/main-current-knee-swaps.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
