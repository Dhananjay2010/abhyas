#!/usr/bin/env tsx
/**
 * Test WarmupSection Deload label rendering
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

console.log("\n=== Test: Deload label renders ===\n");

const { container } = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={null}
    strengthDone={false}
    isDeload={true}
    isTraining={true}
  />
);

const text = container.textContent || "";
if (text.includes("Deload")) {
  console.log("✅ Deload label present");
} else {
  console.error("❌ FAIL: Deload label missing");
  process.exit(1);
}

console.log("\n✅ Test passed\n");
