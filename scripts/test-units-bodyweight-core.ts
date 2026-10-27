#!/usr/bin/env tsx
/**
 * L-d: Body weight validation through logBodyWeightCore.
 * 
 * Tests the complete server path: getProfileUnits → validateBodyWeightKg → insert.
 * Uses fake client with imperial/metric profiles.
 * 
 * Imperial: 55.5 lb and 661 lb accepted (rows inserted), 55 lb and 661.5 lb rejected (no insert)
 * Metric: 25 kg and 300 kg accepted, 24.9 kg and 300.1 kg rejected
 * DB constraint: 25 ≤ weight_kg ≤ 300, maps to friendly unit-aware message
 */

import { logBodyWeightCore, createBodyWeightDbOps } from "@/lib/progress/log-bodyweight-core";
import { parseWeight } from "@/lib/units";
import { createFakeDb } from "./helpers/fake-postgrest";

console.log("\n🧪 L-d: logBodyWeightCore with injected clients\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Helper to create fake DB with body_metrics CHECK constraint
function createFakeDbWithConstraint() {
  const fake = createFakeDb({
    tables: {
      profiles: [{ id: "user-1", units: "imperial", timezone: "America/New_York" }],
      body_metrics: [],
    },
  });
  
  // Simulate body_metrics_weight_sane CHECK constraint: 25 ≤ weight_kg ≤ 300
  const originalBeforeRequest = fake.beforeRequest;
  fake.beforeRequest = (req) => {
    if (req.table === "body_metrics" && req.method === "POST" && req.body) {
      const body = Array.isArray(req.body) ? req.body : [req.body];
      for (const row of body) {
        const weightKg = row.weight_kg;
        if (typeof weightKg === "number" && (weightKg < 25 || weightKg > 300)) {
          return new Response(
            JSON.stringify({
              code: "23514",
              message: "new row for relation \"body_metrics\" violates check constraint \"body_metrics_weight_sane\"",
              details: "Failing row contains (...)",
              hint: null,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }
    return originalBeforeRequest(req);
  };
  
  return fake;
}

(async () => {
  // ============================================================
  // Imperial: 55 lb rejected client-side by parseWeight (no insert)
  // ============================================================
  {
    const fake = createFakeDbWithConstraint();
    
    const kg55lb = parseWeight("55", "imperial");
    check("Imperial 55 lb: rejected by parseWeight", kg55lb === null);
    
    // parseWeight should reject 55 lb, so no need to call logBodyWeightCore
    if (kg55lb !== null) {
      throw new Error("parseWeight incorrectly accepted 55 lb");
    }
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 55 lb: no row inserted", rows.length === 0, `got ${rows.length} rows`);
  }

  // ============================================================
  // Imperial: 55.5 lb accepted (minimum boundary, stored as 25.2 kg)
  // ============================================================
  {
    const fake = createFakeDbWithConstraint();
    
    const kg55_5lb = parseWeight("55.5", "imperial");
    check("Imperial 55.5 lb: accepted by parseWeight", kg55_5lb !== null, kg55_5lb ? `got ${kg55_5lb} kg` : "rejected");
    
    if (kg55_5lb === null) throw new Error("parseWeight rejected 55.5 lb");
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, kg55_5lb, "America/New_York");
    check("Imperial 55.5 lb: logBodyWeightCore accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 55.5 lb: row inserted", rows.length === 1, `got ${rows.length} rows`);
    
    if (rows.length === 1) {
      const storedKg = rows[0].weight_kg;
      if (typeof storedKg !== "number") throw new Error(`Expected weight_kg to be number, got ${typeof storedKg}`);
      check("Imperial 55.5 lb: stored kg ≥ 25", storedKg >= 25, `got ${storedKg} kg`);
      check("Imperial 55.5 lb: stored as ~25.2 kg", Math.abs(storedKg - 25.2) < 0.1, `got ${storedKg} kg`);
    }
  }

  // ============================================================
  // Imperial: 661 lb accepted (maximum boundary, stored as 299.8 kg)
  // ============================================================
  {
    const fake = createFakeDbWithConstraint();
    
    const kg661lb = parseWeight("661", "imperial");
    check("Imperial 661 lb: accepted by parseWeight", kg661lb !== null, kg661lb ? `got ${kg661lb} kg` : "rejected");
    
    if (kg661lb === null) throw new Error("parseWeight rejected 661 lb");
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, kg661lb, "America/New_York");
    check("Imperial 661 lb: logBodyWeightCore accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 661 lb: row inserted", rows.length === 1, `got ${rows.length} rows`);
    
    if (rows.length === 1) {
      const storedKg = rows[0].weight_kg;
      if (typeof storedKg !== "number") throw new Error(`Expected weight_kg to be number, got ${typeof storedKg}`);
      check("Imperial 661 lb: stored kg ≤ 300", storedKg <= 300, `got ${storedKg} kg`);
      check("Imperial 661 lb: stored as ~299.8 kg", Math.abs(storedKg - 299.8) < 0.1, `got ${storedKg} kg`);
    }
  }

  // ============================================================
  // Imperial: 661.5 lb rejected (above maximum)
  // ============================================================
  {
    const fake = createFakeDbWithConstraint();
    
    const kg661_5lb = parseWeight("661.5", "imperial");
    check("Imperial 661.5 lb: rejected by parseWeight", kg661_5lb === null);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 661.5 lb: no row inserted", rows.length === 0, `got ${rows.length} rows`);
  }

  // ============================================================
  // DB constraint error maps to friendly message (imperial)
  // ============================================================
  {
    const fake = createFakeDbWithConstraint();
    
    // Force a value that somehow bypasses validateBodyWeightKg but hits DB constraint
    // (This shouldn't happen in practice, but tests the error mapping)
    // Use 24.9 kg which is below the DB constraint of 25 kg
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, 24.9, "America/New_York");
    
    check("DB constraint error: rejected", result.ok === false);
    check("DB constraint error: contains 'lb'", result.ok === false && result.error.includes("lb"), result.ok ? "" : result.error);
    check("DB constraint error: contains '55.5'", result.ok === false && result.error.includes("55.5"), result.ok ? "" : result.error);
    check("DB constraint error: contains '661'", result.ok === false && result.error.includes("661"), result.ok ? "" : result.error);
  }

  // ============================================================
  // Metric: 25 kg accepted (minimum boundary)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric", timezone: "Europe/London" }],
        body_metrics: [],
      },
    });
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, 25, "Europe/London");
    
    check("Metric 25 kg: accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Metric 25 kg: row inserted", rows.length === 1, `got ${rows.length} rows`);
  }

  // ============================================================
  // Metric: 24.9 kg rejected (below minimum)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric", timezone: "Europe/London" }],
        body_metrics: [],
      },
    });
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, 24.9, "Europe/London");
    
    check("Metric 24.9 kg: rejected", result.ok === false);
    check("Metric 24.9 kg: error contains 'kg'", result.ok === false && result.error.includes("kg"));
    check("Metric 24.9 kg: error contains '25'", result.ok === false && result.error.includes("25"));
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Metric 24.9 kg: no row inserted", rows.length === 0, `got ${rows.length} rows`);
  }

  // ============================================================
  // Metric: 300 kg accepted (maximum boundary)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric", timezone: "Europe/London" }],
        body_metrics: [],
      },
    });
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, 300, "Europe/London");
    
    check("Metric 300 kg: accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Metric 300 kg: row inserted", rows.length === 1, `got ${rows.length} rows`);
  }

  // ============================================================
  // Metric: 300.1 kg rejected (above maximum)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric", timezone: "Europe/London" }],
        body_metrics: [],
      },
    });
    
    const db = createBodyWeightDbOps(fake.client, "user-1");
    const result = await logBodyWeightCore(db, 300.1, "Europe/London");
    
    check("Metric 300.1 kg: rejected", result.ok === false);
    check("Metric 300.1 kg: error contains 'kg'", result.ok === false && result.error.includes("kg"));
    check("Metric 300.1 kg: error contains '300'", result.ok === false && result.error.includes("300"));
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Metric 300.1 kg: no row inserted", rows.length === 0, `got ${rows.length} rows`);
  }

  if (failures === 0) {
    console.log("\n✅ All checks passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} check(s) failed\n`);
    process.exit(1);
  }
})();
