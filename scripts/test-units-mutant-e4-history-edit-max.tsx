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
import { render, fireEvent } from "@testing-library/react";
import { EditSets } from "../src/app/history/[id]/edit-sets";

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

  const el = container.querySelector('input[type="number"][placeholder="lb"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Imperial weight input not found");
  }

  check('Weight input max is "999"', el.max === "999", `got "${el.max}"`);
}

// Test 2: Imperial user: entering 1000 lb shows error or disables save
console.log("\n2. Imperial user: entering 1000 lb shows validation error");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "imperial" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const el = container.querySelector('input[type="number"][placeholder="lb"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Imperial weight input not found");
  }

  fireEvent.change(el, { target: { value: "1000" } });
  fireEvent.blur(el);

  const errorText = container.textContent || "";
  const hasError = errorText.includes("999 lb") || errorText.includes("Maximum");

  check(
    "1000 lb shows error with 999 lb limit",
    hasError,
    hasError ? "error message found" : "no error shown"
  );
}

// Test 3: Imperial user: entering 999 lb has no error (would save if clicked)
console.log("\n3. Imperial user: 999 lb accepted (no validation error)");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "imperial" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const el = container.querySelector('input[type="number"][placeholder="lb"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Imperial weight input not found");
  }

  fireEvent.change(el, { target: { value: "999" } });
  fireEvent.blur(el);

  const errorText = container.textContent || "";
  const hasMaxError = errorText.includes("999 lb") || (errorText.includes("Maximum") && errorText.includes("lb"));

  check(
    "999 lb accepted (no max error)",
    !hasMaxError,
    hasMaxError ? "UNEXPECTED: error shown for valid value" : "no error"
  );
}

// Test 4: Metric user sees max="500"
console.log("\n4. Metric user: weight input max attribute");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "metric" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const el = container.querySelector('input[type="number"][placeholder="kg"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Metric weight input not found");
  }

  check('Weight input max is "500"', el.max === "500", `got "${el.max}"`);
}

// Test 5: Metric user: entering 501 kg shows error
console.log("\n5. Metric user: entering 501 kg shows validation error");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "metric" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const el = container.querySelector('input[type="number"][placeholder="kg"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Metric weight input not found");
  }

  fireEvent.change(el, { target: { value: "501" } });
  fireEvent.blur(el);

  const errorText = container.textContent || "";
  const hasError = errorText.includes("500 kg") || errorText.includes("Maximum");

  check(
    "501 kg shows error with 500 kg limit",
    hasError,
    hasError ? "error message found" : "no error shown"
  );
}

// Test 6: Metric user: entering 500 kg has no error
console.log("\n6. Metric user: 500 kg accepted (no validation error)");
{
  const { container, getAllByText } = render(
    React.createElement(EditSets, {
      units: "metric" as const,
      exercises,
    })
  );

  const editButtons = getAllByText("Edit sets");
  fireEvent.click(editButtons[0]);

  const el = container.querySelector('input[type="number"][placeholder="kg"]');
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("Metric weight input not found");
  }

  fireEvent.change(el, { target: { value: "500" } });
  fireEvent.blur(el);

  const errorText = container.textContent || "";
  const hasMaxError = errorText.includes("500 kg") || (errorText.includes("Maximum") && errorText.includes("kg"));

  check(
    "500 kg accepted (no max error)",
    !hasMaxError,
    hasMaxError ? "UNEXPECTED: error shown for valid value" : "no error"
  );
}

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed`);
  console.error("Mutant E4 (max 1100) would PASS this test.\n");
  process.exit(1);
}

console.log("\n✅ Mutant E4 killed: History edit enforces correct max limits\n");