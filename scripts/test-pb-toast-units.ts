#!/usr/bin/env tsx
/**
 * Test that PB (personal-best) toasts use formatWeight with the user's units.
 * Verifies both imperial (lb) and metric (kg) for weight and E1RM toasts.
 */

import { describePersonalBest, type PersonalBest } from "@/lib/program/progression";

let failures = 0;

function check(name: string, pass: boolean, got?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${got ? `  -- got: ${got}` : ""}`);
    failures++;
  }
}

console.log("\n=== PB Toast Units (Weight) ===");
{
  const weightPB: PersonalBest = { kind: "weight", value: 65 };
  
  const metricToast = describePersonalBest(weightPB, "metric");
  check("Metric weight PB: 65 kg", metricToast === "Heaviest set yet — 65 kg", metricToast);
  
  const imperialToast = describePersonalBest(weightPB, "imperial");
  check("Imperial weight PB: ~143 lb", imperialToast === "Heaviest set yet — 143.5 lb", imperialToast);
}

console.log("\n=== PB Toast Units (E1RM) ===");
{
  const e1rmPB: PersonalBest = { kind: "e1rm", value: 100.7 };
  
  const metricToast = describePersonalBest(e1rmPB, "metric");
  check("Metric E1RM PB: 101 kg (rounded)", metricToast === "Best estimated one-rep max yet — 101 kg", metricToast);
  
  const imperialToast = describePersonalBest(e1rmPB, "imperial");
  check("Imperial E1RM PB: ~222.5 lb", imperialToast === "Best estimated one-rep max yet — 222.5 lb", imperialToast);
}

console.log("\n=== PB Toast Units (Hold - no units) ===");
{
  const holdPB: PersonalBest = { kind: "hold", value: 45 };
  const toast = describePersonalBest(holdPB, "metric");
  check("Hold PB: 45s (units parameter ignored)", toast === "Longest hold yet — 45s", toast);
}

console.log("\n=== PB Toast Units (Reps - no units) ===");
{
  const repsPB: PersonalBest = { kind: "reps", value: 15 };
  const toast = describePersonalBest(repsPB, "imperial");
  check("Reps PB: 15 (units parameter ignored)", toast === "Most reps yet — 15", toast);
}

if (failures === 0) {
  console.log("\n✅ All PB toast unit tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
