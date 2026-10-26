#!/usr/bin/env tsx
/**
 * V6-V9: Server action cores with injected clients.
 * 
 * Tests real action validation paths:
 * - checkLogSetInput (used by logSet action)
 * - updateSetCore (used by updateSet action)
 * 
 * Uses fake clients with imperial/metric profiles.
 */

import { checkLogSetInput } from "@/lib/session/check-log-set-input";
import { updateSetCore } from "@/lib/history/edit-cores";
import { createFakeDb } from "./helpers/fake-postgrest";
import { displayToKg } from "@/lib/units";

console.log("\n🧪 V6-V9: Action validation with injected clients\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  // ============================================================
  // V6/V9: checkLogSetInput (used by logSet action)
  // ============================================================
  console.log("checkLogSetInput (logSet action path):");

  // Imperial profile: 999 lb ok
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial" }],
      },
    });
    
    const kg999lb = displayToKg(999, "imperial");
    const error = await checkLogSetInput(fake.client, "user-1", {
      reps: 8,
      weightKg: kg999lb,
    });
    
    check("V6/V9: Imperial 999 lb accepted", error === null, error ? `got error: "${error}"` : "");
  }

  // Imperial profile: 1000 lb rejected with lb message
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial" }],
      },
    });
    
    const kg1000lb = displayToKg(1000, "imperial");
    const error = await checkLogSetInput(fake.client, "user-1", {
      reps: 8,
      weightKg: kg1000lb,
    });
    
    check("V6/V9: Imperial 1000 lb rejected", error !== null);
    check("V6/V9: Imperial error contains 'lb'", error?.includes("lb") ?? false, error ? `got: "${error}"` : "");
    check("V6/V9: Imperial error contains '999 lb'", error?.includes("999 lb") ?? false, error ? `got: "${error}"` : "");
    check("V6/V9: Imperial error does NOT contain 'kg'", !(error?.includes("kg") ?? true), error ? `got: "${error}"` : "");
  }

  // Metric profile: 500 kg ok
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric" }],
      },
    });
    
    const error = await checkLogSetInput(fake.client, "user-1", {
      reps: 8,
      weightKg: 500,
    });
    
    check("V6/V9: Metric 500 kg accepted", error === null, error ? `got error: "${error}"` : "");
  }

  // Metric profile: 501 kg rejected with kg message
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric" }],
      },
    });
    
    const error = await checkLogSetInput(fake.client, "user-1", {
      reps: 8,
      weightKg: 501,
    });
    
    check("V6/V9: Metric 501 kg rejected", error !== null);
    check("V6/V9: Metric error contains 'kg'", error?.includes("kg") ?? false, error ? `got: "${error}"` : "");
    check("V6/V9: Metric error contains '500 kg'", error?.includes("500 kg") ?? false, error ? `got: "${error}"` : "");
    check("V6/V9: Metric error does NOT contain 'lb'", !(error?.includes("lb") ?? true), error ? `got: "${error}"` : "");
  }

  // ============================================================
  // V7/V8: updateSetCore (updateSet action path)
  // ============================================================
  console.log("\nupdateSetCore (updateSet action path):");

  // Imperial profile: 1000 lb rejected with lb message
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial" }],
        session_exercises: [{ id: "ex1", session_id: "s1", user_id: "user-1" }],
        session_sets: [],
      },
    });
    
    const kg1000lb = displayToKg(1000, "imperial");
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
    
    check("V7/V8: Imperial 1000 lb rejected", result.success === false);
    check("V7/V8: Imperial error contains 'lb'", result.error?.includes("lb") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7/V8: Imperial error contains '999 lb'", result.error?.includes("999 lb") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7/V8: Imperial error does NOT contain 'kg'", !(result.error?.includes("kg") ?? true), result.error ? `got: "${result.error}"` : "");
  }

  // Metric profile: 501 kg rejected with kg message
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric" }],
        session_exercises: [{ id: "ex2", session_id: "s2", user_id: "user-1" }],
        session_sets: [],
      },
    });
    
    const result = await updateSetCore(
      fake.client,
      "user-1",
      "ex2",
      1,
      8,
      501,
      null,
      "metric"
    );
    
    check("V7/V8: Metric 501 kg rejected", result.success === false);
    check("V7/V8: Metric error contains 'kg'", result.error?.includes("kg") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7/V8: Metric error contains '500 kg'", result.error?.includes("500 kg") ?? false, result.error ? `got: "${result.error}"` : "");
    check("V7/V8: Metric error does NOT contain 'lb'", !(result.error?.includes("lb") ?? true), result.error ? `got: "${result.error}"` : "");
  }

  if (failures === 0) {
    console.log("\n✅ All checks passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} check(s) failed\n`);
    process.exit(1);
  }
})();
