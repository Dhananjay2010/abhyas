#!/usr/bin/env tsx
/**
 * Mutant E4: History edit max 999 changed to 1100.
 *
 * This test verifies that History edit enforces the correct max weight limit
 * using LOAD_IMPERIAL_MAX_LB (999 lb) and LOAD_METRIC_MAX_KG (500 kg).
 * The mutant would accept 1100 lb, which exceeds the server's 500 kg limit.
 */

// Must be first import before any React code
import "./helpers/setup-jsdom";

// Mock next/navigation and actions BEFORE importing EditSets
import Module from "node:module";

const updateSetCalls: Array<{
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
}> = [];

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push: () => {},
        replace: () => {},
        back: () => {},
        forward: () => {},
        refresh: () => {},
        prefetch: () => {},
      }),
      usePathname: () => "/",
      useSearchParams: () => new URLSearchParams(),
    };
  }
  if (id === "../actions") {
    return {
      updateSet: async (
        sessionExerciseId: string,
        setNumber: number,
        reps: number | null,
        weightKg: number | null,
        durationSeconds: number | null
      ) => {
        updateSetCalls.push({ sessionExerciseId, setNumber, reps, weightKg, durationSeconds });
        return { success: true };
      },
      deleteSet: async () => ({ success: true }),
    };
  }
  return originalRequire.call(this, id);
};

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { EditSets } from "../src/app/history/[id]/edit-sets";
import { displayToKg } from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nMutant E4: History edit max must be LOAD_IMPERIAL_MAX_LB (999 lb)\n");

const exercises = [
  {
    id: "ex1",
    name: "Bench Press",
    metric: "reps" as const,
    sets: [
      {
        session_exercise_id: "se1",
        set_number: 1,
        reps: 8,
        weight_kg: 60,
        duration_seconds: null,
        is_warmup_set: false,
      },
    ],
  },
];

// Test 1: Imperial user sees max="999"
console.log("\n1. Imperial user: weight input max attribute");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "imperial" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const weightInput = container.querySelector('input[type="number"][placeholder="lb"]') as HTMLInputElement;
  check(
    "Weight input exists",
    weightInput !== null
  );

  check(
    'Weight input max is "999"',
    weightInput?.max === "999",
    `got "${weightInput?.max}"`
  );
}

// Test 2: Metric user sees max="500"
console.log("\n2. Metric user: weight input max attribute");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "metric" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const weightInput = container.querySelector('input[type="number"][placeholder="kg"]') as HTMLInputElement;
  check(
    "Weight input exists",
    weightInput !== null
  );

  check(
    'Weight input max is "500"',
    weightInput?.max === "500",
    `got "${weightInput?.max}"`
  );
}

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed`);
  console.error("Mutant E4 (max 1100) would PASS this test.\n");
  process.exit(1);
}

console.log("\n✅ Mutant E4 killed: History edit enforces correct max limits\n");
