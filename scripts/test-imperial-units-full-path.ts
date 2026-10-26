#!/usr/bin/env tsx
/**
 * Test that progression messages respect user's units preference
 * including after switching from kg to lb.
 * 
 * Tests the COMPLETE path: getProfileUnits → progressionFeedback → evaluateProgression → displayWeight
 * 
 * Must fail if any link in the chain drops units.
 */

import { progressionFeedback } from "../src/lib/session/progression-feedback";
import { getProfileUnits } from "../src/lib/get-profile-units";
import type { UnitsPreference } from "../src/lib/units";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Fake Supabase client for testing with mutable units preference
type FakeSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: { units: UnitsPreference }; error: null }>;
      };
    };
  };
  _testSetUnits: (newUnits: UnitsPreference) => void;
};

function makeFakeClient(initialUnits: UnitsPreference): FakeSupabaseClient {
  let currentUnits = initialUnits;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { units: currentUnits },
            error: null,
          }),
        }),
      }),
    }),
    _testSetUnits: (newUnits: UnitsPreference) => {
      currentUnits = newUnits;
    },
  };
}

async function runTests() {
  console.log("\n🧪 Progression messages respect user units (MEDIUM M-1)\n");

  // Test data
  const sessionExercise = {
    id: "se-1",
    session_id: "sess-1",
    exercise_id: "ex-1",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps" as const,
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "horizontal_press" as const,
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
  };

  const progress = {
    current_working_weight_kg: 40,
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: 40,
    best_reps: 12,
    best_e1rm: 56,
    total_sessions: 5,
    weight_at_failure_start_kg: null,
  };

  const session = {
    is_deload: false,
    local_date: "2026-10-26",
    program_id: "prog-1",
  };

  const successSets = [
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
  ];

  console.log("1. Imperial user (never switched)");
  const imperialClient = makeFakeClient("imperial");
  const imperialUnits = await getProfileUnits(imperialClient, "user-1");
  check("getProfileUnits returns 'imperial'", imperialUnits === "imperial");

  const imperial = progressionFeedback(sessionExercise, successSets, progress, session, "right", imperialUnits);
  console.log(`  Message: "${imperial.decision.message}"`);
  check("Message contains 'lb'", imperial.decision.message.includes("lb"), imperial.decision.message);
  check("Message does NOT contain 'kg'", !imperial.decision.message.includes("kg"), imperial.decision.message);
  check("Message shows '93.5 lb' (40 kg → 42.5 kg = 93.5 lb)", imperial.decision.message.includes("93.5 lb"), imperial.decision.message);

  console.log("\n2. User who switched from kg to lb (REAL dynamic switch)");
  const switchingClient = makeFakeClient("metric");
  
  // First check - user is on metric
  const beforeUnits = await getProfileUnits(switchingClient, "user-2");
  check("Before switch: getProfileUnits returns 'metric'", beforeUnits === "metric");
  const before = progressionFeedback(sessionExercise, successSets, progress, session, "right", beforeUnits);
  console.log(`  Before: "${before.decision.message}"`);
  check("Before switch: message has 'kg'", before.decision.message.includes("kg"), before.decision.message);
  check("Before switch: message has NO 'lb'", !before.decision.message.includes("lb"), before.decision.message);
  
  // User switches to imperial
  switchingClient._testSetUnits("imperial");
  
  // Second check - same client, now imperial
  const afterUnits = await getProfileUnits(switchingClient, "user-2");
  check("After switch: getProfileUnits returns 'imperial'", afterUnits === "imperial");
  const after = progressionFeedback(sessionExercise, successSets, progress, session, "right", afterUnits);
  console.log(`  After: "${after.decision.message}"`);
  check("After switch: message has 'lb'", after.decision.message.includes("lb"), after.decision.message);
  check("After switch: message has NO 'kg'", !after.decision.message.includes("kg"), after.decision.message);
  check("After switch: message shows '93.5 lb'", after.decision.message.includes("93.5 lb"), after.decision.message);

  console.log("\n3. PB toast respects units");
  const pbProgress = {
    ...progress,
    best_weight_kg: 37.5, // Lower so 40 kg is a PB
  };
  const pbSets = [
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
  ];

  const imperialPB = progressionFeedback(sessionExercise, pbSets, pbProgress, session, "right", imperialUnits);
  console.log(`  PB: "${imperialPB.personalBest}"`);
  check("PB contains 'lb'", imperialPB.personalBest?.includes("lb") ?? false, imperialPB.personalBest ?? "null");
  check("PB does NOT contain 'kg'", !(imperialPB.personalBest?.includes("kg") ?? true), imperialPB.personalBest ?? "null");

  console.log("\n4. Metric still works");
  const metricClient = makeFakeClient("metric");
  const metricUnits = await getProfileUnits(metricClient, "user-3");
  const metric = progressionFeedback(sessionExercise, successSets, progress, session, "right", metricUnits);
  console.log(`  Message: "${metric.decision.message}"`);
  check("Metric has 'kg'", metric.decision.message.includes("kg"));
  check("Metric has NO 'lb'", !metric.decision.message.includes("lb"));

  console.log("\n=== SUMMARY ===");
  if (failures === 0) {
    console.log("✅ ALL PASS");
    console.log("Kills mutants:");
    console.log("  - MSG1: getProfileUnits not called → imperial user sees 'kg'");
    console.log("  - MSG2: units dropped from progressionFeedback → messages show 'kg'");
    console.log("  - MSG3: units dropped from evaluateProgression → default 'metric' used");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} failure(s)`);
    process.exit(1);
  }
}

runTests();
