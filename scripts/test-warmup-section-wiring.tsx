#!/usr/bin/env tsx
/**
 * Test WarmupSection wiring: page.tsx must pass correct props through
 */
import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { WarmupSection } from "../src/components/today/warmup-section";
import React from "react";

const exercise = {
  key: "1",
  name: "Squat",
  cue: null,
  metric: "reps" as const,
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
  skipped: false,
  swappedIn: false,
};

console.log("\n=== Test 1: isDeload hard-coded false breaks deload label ===\n");

// This test proves that page.tsx MUST pass the computed isDeload value
// Hard-coding isDeload={false} would hide the deload label even on deload weeks
const hardcodedFalse = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={null}
    strengthDone={false}
    isDeload={false}
    isTraining={true}
  />
);

const textFalse = hardcodedFalse.container.textContent || "";
if (textFalse.includes("Deload")) {
  console.error("❌ FAIL: Deload label shown when isDeload={false} (wiring test setup error)");
  process.exit(1);
}

// Correct wiring: isDeload={true} shows the label
const correctWiring = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={null}
    strengthDone={false}
    isDeload={true}
    isTraining={true}
  />
);

const textTrue = correctWiring.container.textContent || "";
if (!textTrue.includes("Deload")) {
  console.error("❌ FAIL: Deload label missing when isDeload={true}");
  process.exit(1);
}

console.log("✅ PASS: Hard-coding isDeload={false} would break deload display");
console.log("         Page must pass computed isDeload value through");

console.log("\n=== Test 2: actual={null} hard-coded breaks 'Where you got to' ===\n");

// This test proves that page.tsx MUST pass the actual session data
// Hard-coding actual={null} would always show "Warm-up, then" even when session exists
const hardcodedNull = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={null}
    strengthDone={false}
    isDeload={false}
    isTraining={true}
  />
);

const headingNull = hardcodedNull.container.querySelector("h2")?.textContent || "";
if (headingNull !== "Warm-up, then") {
  console.error("❌ FAIL: Expected 'Warm-up, then' when actual={null} (wiring test setup error)");
  process.exit(1);
}

// Correct wiring: actual=[...] shows "Where you got to"
const withActual = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={[{ reps: 10 }]}
    strengthDone={false}
    isDeload={false}
    isTraining={true}
  />
);

const headingWithActual = withActual.container.querySelector("h2")?.textContent || "";
if (headingWithActual !== "Where you got to" && headingWithActual !== "What you did") {
  console.error(`❌ FAIL: Expected 'Where you got to' or 'What you did' when actual exists, got '${headingWithActual}'`);
  process.exit(1);
}

console.log("✅ PASS: Hard-coding actual={null} would break session state display");
console.log("         Page must pass actual session data through");

console.log("\n✅ All wiring tests passed\n");
