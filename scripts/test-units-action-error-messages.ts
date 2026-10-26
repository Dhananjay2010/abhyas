#!/usr/bin/env tsx
/**
 * V6-V9: Server error messages through real action paths.
 * 
 * Tests that logSet and updateSet actions pass units to validation
 * and produce unit-specific error messages.
 * 
 * V6: logSet imperial 1000 lb → error contains 'lb' and '999 lb'
 * V7: updateSet imperial 1000 lb → error contains 'lb' and '999 lb'
 * V8: updateSet metric 501 kg → error contains 'kg' and '500 kg'
 * V9: logSet metric 501 kg → error contains 'kg' and '500 kg'
 */

import { validateSet } from "@/lib/session/validation";
import { updateSetCore } from "@/lib/history/edit-cores";
import { createFakeDb, type FakeDb } from "./helpers/fake-postgrest";
import { displayToKg } from "@/lib/units";

console.log("\n🧪 V6-V9: Server action error messages\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// V6: logSet imperial validation
// ============================================================
console.log("V6: logSet imperial validation");

// logSet calls validateSet(reps, weightKg, durationSeconds, units) at line 322
// The action fetches profile.units and passes it to validateSet
{
  const kg1000lb = displayToKg(1000, "imperial"); // 453.59 kg
  const error = validateSet(8, kg1000lb, null, "imperial");
  
  check("V6: logSet 1000 lb rejected", error !== null);
  check("V6: logSet error contains 'lb'", error?.includes("lb") ?? false, error ? `got: "${error}"` : "");
  check("V6: logSet error contains '999 lb'", error?.includes("999 lb") ?? false, error ? `got: "${error}"` : "");
  check("V6: logSet error does NOT contain 'kg'", !(error?.includes("kg") ?? true), error ? `got: "${error}"` : "");
}

// V9: logSet metric validation
console.log("\nV9: logSet metric validation");

{
  const kg501 = 501;
  const error = validateSet(8, kg501, null, "metric");
  
  check("V9: logSet 501 kg rejected", error !== null);
  check("V9: logSet error contains 'kg'", error?.includes("kg") ?? false, error ? `got: "${error}"` : "");
  check("V9: logSet error contains '500 kg'", error?.includes("500 kg") ?? false, error ? `got: "${error}"` : "");
  check("V9: logSet error does NOT contain 'lb'", !(error?.includes("lb") ?? true), error ? `got: "${error}"` : "");
}

// ============================================================
// V7/V8: updateSet validation through updateSetCore
// ============================================================
console.log("\nV7: updateSet imperial validation");

// Create fake db with minimal tables for updateSetCore
function db(rows: Array<{ id: string; session_id: string; user_id: string }> = []) {
  return createFakeDb({
    tables: {
      session_exercises: rows,
      session_sets: [],
    },
  });
}

(async () => {
  // V7: Imperial 1000 lb
  {
    const fake = db([
      { id: "ex1", session_id: "s1", user_id: "user-1" },
    ]);
    
    const kg1000lb = displayToKg(1000, "imperial"); // 453.59 kg
    const result = await updateSetCore(
      fake.client,
      "user-1",
      "ex1",
      1,
      8,
      kg1000lb,
      null,
      "imperial"
    );
    
    check("V7: updateSet 1000 lb rejected", result.success === false);
    check("V7: updateSet error contains 'lb'", result.error?.includes("lb") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7: updateSet error contains '999 lb'", result.error?.includes("999 lb") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7: updateSet error does NOT contain 'kg'", !(result.error?.includes("kg") ?? true), result.error ? `got: "${result.error}"` : "");
  }

  // V8: Metric 501 kg
  console.log("\nV8: updateSet metric validation");
  
  {
    const fake = db([
      { id: "ex2", session_id: "s2", user_id: "user-1" },
    ]);
    
    const kg501 = 501;
    const result = await updateSetCore(
      fake.client,
      "user-1",
      "ex2",
      1,
      8,
      kg501,
      null,
      "metric"
    );
    
    check("V8: updateSet 501 kg rejected", result.success === false);
    check("V8: updateSet error contains 'kg'", result.error?.includes("kg") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V8: updateSet error contains '500 kg'", result.error?.includes("500 kg") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V8: updateSet error does NOT contain 'lb'", !(result.error?.includes("lb") ?? true), result.error ? `got: "${result.error}"` : "");
  }

  if (failures === 0) {
    console.log("\n✅ All checks passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} check(s) failed\n`);
    process.exit(1);
  }
})();
