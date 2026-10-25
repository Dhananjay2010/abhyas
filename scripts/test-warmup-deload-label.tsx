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

console.log("\n=== Test 1: Deload label renders for non-skipped training row with no actuals ===\n");

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

console.log("\n=== Test 2: Deload label does NOT show for skipped row ===\n");

const skipped = { ...exercise, skipped: true };
const { container: c2 } = render(
  <WarmupSection
    todayExercises={[skipped]}
    actual={null}
    strengthDone={false}
    isDeload={true}
    isTraining={true}
  />
);

const text2 = c2.textContent || "";
if (text2.includes("Skipped") && !text2.includes("Deload")) {
  console.log("✅ Deload label correctly NOT shown for skipped row");
} else {
  console.error("❌ FAIL: Deload label should not show for skipped row");
  process.exit(1);
}

console.log("\n=== Test 3: Deload label does NOT show for non-training day ===\n");

const { container: c3 } = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={null}
    strengthDone={false}
    isDeload={true}
    isTraining={false}
  />
);

const text3 = c3.textContent || "";
if (!text3.includes("Deload")) {
  console.log("✅ Deload label correctly NOT shown for non-training day");
} else {
  console.error("❌ FAIL: Deload label should not show for non-training day");
  process.exit(1);
}

console.log("\n=== Test 4: Deload label does NOT show when actuals exist ===\n");

const { container: c4 } = render(
  <WarmupSection
    todayExercises={[exercise]}
    actual={[{ reps: 10 }]}
    strengthDone={false}
    isDeload={true}
    isTraining={true}
  />
);

const text4 = c4.textContent || "";
if (!text4.includes("Deload")) {
  console.log("✅ Deload label correctly NOT shown when actuals exist");
} else {
  console.error("❌ FAIL: Deload label should not show when actuals exist");
  process.exit(1);
}

console.log("\n=== Test 5: Section renders for 0 rows ===\n");

const { container: c5 } = render(
  <WarmupSection
    todayExercises={[]}
    actual={null}
    strengthDone={false}
    isDeload={true}
    isTraining={true}
  />
);

if (c5.querySelector("section")) {
  console.log("✅ Section renders for 0 rows");
} else {
  console.error("❌ FAIL: Section should render for 0 rows");
  process.exit(1);
}

console.log("\n✅ All tests passed\n");
