#!/usr/bin/env tsx
/**
 * M3 (BLOCKING): History edit save path converts 135 lb to 61.23 kg.
 *
 * This test renders EditSets with RTL, types 135 lb in the weight box,
 * clicks Save, and asserts that the spy receives weight_kg: 61.23.
 *
 * Mutant: Skip convertWeightInputToKg (use raw numValue) must FAIL this test.
 */

// Must be first import before any React code
import "./helpers/setup-jsdom";

// Mock next/navigation BEFORE importing EditSets
import Module from "node:module";
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push: () => {},
        refresh: () => {},
      }),
    };
  }
  if (id === "../actions") {
    return {
      updateSet: async () => ({ success: true }),
      deleteSet: async () => ({ success: true }),
    };
  }
  return originalRequire.call(this, id);
};

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { EditSets } from "../src/app/history/[id]/edit-sets";

async function runTest() {
  console.log("\nM3: History edit save path converts 135 lb to 61.23 kg\n");

  // Spy to record saveSet calls
  const saveSetCalls: Array<{
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }> = [];

  const saveSetSpy = async (
    sessionExerciseId: string,
    setNumber: number,
    reps: number | null,
    weightKg: number | null,
    durationSeconds: number | null
  ) => {
    saveSetCalls.push({ sessionExerciseId, setNumber, reps, weightKg, durationSeconds });
    return { success: true };
  };

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

  const { getByText, container } = render(
    React.createElement(EditSets, {
      units: "imperial" as const,
      exercises,
      saveSet: saveSetSpy,
    })
  );

  // Step 1: Open edit dialog
  console.log("1. Opening edit dialog...");
  const editButton = getByText("Edit sets");
  if (!editButton) {
    console.error("   ❌ FAIL: Edit button not found");
    process.exit(1);
  }
  fireEvent.click(editButton);
  console.log("   ✓ PASS: Edit dialog opened");

  // Step 2: Find weight input
  const weightInputs = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="number"]')
  ).filter((input) => input.placeholder === "lb");

  if (weightInputs.length === 0) {
    console.error("   ❌ FAIL: Weight input not found");
    process.exit(1);
  }

  const weightInput = weightInputs[0];
  console.log("\n2. Weight input found");
  console.log(`   Initial value: ${weightInput.value} lb`);

  // Step 3: User types 135 lb
  console.log("\n3. User types 135 lb...");
  fireEvent.change(weightInput, { target: { value: "135" } });

  if (weightInput.value !== "135") {
    console.error(`   ❌ FAIL: Input value is ${weightInput.value}, expected 135`);
    process.exit(1);
  }
  console.log("   ✓ PASS: Input shows 135");

  // Step 4: Click Save button
  console.log("\n4. Clicking Save button...");
  const saveButton = getByText("Save");
  if (!saveButton) {
    console.error("   ❌ FAIL: Save button not found");
    process.exit(1);
  }

  // Clear previous calls
  saveSetCalls.length = 0;

  fireEvent.click(saveButton);

  // Wait for the async saveSet call
  await waitFor(
    () => {
      if (saveSetCalls.length === 0) {
        throw new Error("Waiting for saveSet to be called");
      }
    },
    { timeout: 2000 }
  );

  console.log(`   saveSet called ${saveSetCalls.length} time(s)`);

  // Step 5: Assert the spy received 61.23 kg
  if (saveSetCalls.length === 0) {
    console.error("   ❌ FAIL: saveSet was not called");
    process.exit(1);
  }

  const call = saveSetCalls[0];
  console.log("\n5. saveSet received:");
  console.log(`   sessionExerciseId: ${call.sessionExerciseId}`);
  console.log(`   setNumber: ${call.setNumber}`);
  console.log(`   reps: ${call.reps}`);
  console.log(`   weight_kg: ${call.weightKg}`);

  const expectedKg = 61.23;
  if (call.weightKg !== expectedKg) {
    console.error(`   ❌ FAIL: Expected weight_kg: ${expectedKg}, got: ${call.weightKg}`);
    console.error(`   The conversion from 135 lb to kg is missing or wrong!`);
    process.exit(1);
  }

  console.log(`   ✓ PASS: weight_kg is ${call.weightKg} kg (135 lb converted)`);

  console.log("\n✅ M3 PASS: History edit save path converts 135 lb to 61.23 kg\n");
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});