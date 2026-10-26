/**
 * Test: resolveSwapPrefill passes equipmentIds to suggestedWeight.
 * This test KILLS the SWAP mutant (equipmentIds forced to undefined).
 * 
 * Uses fake-swap-db.ts (no live Supabase required).
 */

import { createSwapDb } from "./helpers/fake-swap-db";
import { resolveSwapPrefill } from "../src/lib/session/swap-prefill";
import { randomUUID } from "crypto";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTest() {
  console.log("SWAP mutant killer: resolveSwapPrefill must pass equipmentIds\n");

  const userId = randomUUID();
  const barbellCurlId = randomUUID();

  // Create fake DB with barbell curl exercise at 102kg
  // 102 * 0.7 = 71.4kg
  // With equipmentIds=['barbell']: 72.5kg (2.5kg grid)
  // With equipmentIds=undefined: 71.25kg (1.25kg isolation grid)
  const db = createSwapDb({
    profiles: [{
      id: userId,
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
    }],
    exercises: [{
      id: barbellCurlId,
      name: "Barbell Curl",
      slug: "barbell-curl",
      movement_pattern: "biceps",
      mechanic: "isolation",
      metric: "reps",
      equipment_ids: ["barbell"],
      primary_muscles: ["biceps"],
    }],
    exercise_progress: [{
      user_id: userId,
      exercise_id: barbellCurlId,
      current_working_weight_kg: 102,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 102,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
      weight_at_failure_start_kg: null,
    }],
  });

  // Test deload swap prefill
  const prefill = await resolveSwapPrefill(
    db.client,
    userId,
    barbellCurlId,
    true, // isDeload
    ["barbell"],
    "isolation",
    "reps",
    "biceps",
    undefined,
    true,
  );

  console.log(`102kg barbell isolation deload: ${prefill} kg\n`);

  check("Deload prefill: 72.5kg (2.5kg barbell grid)", prefill === 72.5, `got ${prefill}`);
  check("SWAP mutant killed: NOT 71.25kg (1.25kg isolation grid)", prefill !== 71.25, `got ${prefill}`);
  check("SWAP mutant killed: NOT 70kg (alternative rounding)", prefill !== 70, `got ${prefill}`);

  if (failures > 0) {
    console.log(`\n❌ ${failures} failure(s)\n`);
    console.log("The SWAP mutant survived: equipmentIds not properly passed.\n");
    process.exit(1);
  } else {
    console.log("✅ SWAP mutant killed: equipmentIds correctly affects swap prefill\n");
    process.exit(0);
  }
}

runTest().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
