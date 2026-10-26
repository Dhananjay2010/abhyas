#!/usr/bin/env tsx
/**
 * L-d: Body weight validation through logBodyWeightCore.
 * 
 * Tests the complete server path: getProfileUnits → validateBodyWeightKg → insert.
 * Uses fake client with imperial/metric profiles.
 * 
 * Imperial: 55 lb and 661 lb accepted (rows inserted), 54 lb and 662 lb rejected (no insert)
 * Metric: 25 kg and 300 kg accepted, 24.9 kg and 300.1 kg rejected
 */

import { logBodyWeightCore } from "@/lib/progress/log-bodyweight-core";
import { parseWeight } from "@/lib/units";
import { createFakeDb } from "./helpers/fake-postgrest";

console.log("\n🧪 L-d: logBodyWeightCore with injected clients\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  // ============================================================
  // Imperial: 55 lb accepted (minimum boundary)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial", timezone: "America/New_York" }],
        body_metrics: [],
      },
    });
    
    const kg55lb = parseWeight("55", "imperial");
    if (kg55lb === null) throw new Error("parseWeight rejected 55 lb");
    
    const result = await logBodyWeightCore(fake.client, "user-1", kg55lb, "America/New_York");
    
    check("Imperial 55 lb: accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 55 lb: row inserted", rows.length === 1, `got ${rows.length} rows`);
  }

  // ============================================================
  // Imperial: 54 lb rejected (below minimum)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial", timezone: "America/New_York" }],
        body_metrics: [],
      },
    });
    
    const kg54lb = parseWeight("54", "imperial");
    if (kg54lb !== null) throw new Error("parseWeight should reject 54 lb");
    
    // Use raw conversion for testing rejection
    const manualKg = 54 * 0.453592;
    const result = await logBodyWeightCore(fake.client, "user-1", manualKg, "America/New_York");
    
    check("Imperial 54 lb: rejected", result.ok === false);
    check("Imperial 54 lb: error contains 'lb'", result.ok === false && result.error.includes("lb"));
    check("Imperial 54 lb: error contains '55'", result.ok === false && result.error.includes("55"));
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 54 lb: no row inserted", rows.length === 0, `got ${rows.length} rows`);
  }

  // ============================================================
  // Imperial: 661 lb accepted (maximum boundary)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial", timezone: "America/New_York" }],
        body_metrics: [],
      },
    });
    
    const kg661lb = parseWeight("661", "imperial");
    if (kg661lb === null) throw new Error("parseWeight rejected 661 lb");
    
    const result = await logBodyWeightCore(fake.client, "user-1", kg661lb, "America/New_York");
    
    check("Imperial 661 lb: accepted", result.ok === true, result.ok ? "" : `error: ${result.error}`);
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 661 lb: row inserted", rows.length === 1, `got ${rows.length} rows`);
  }

  // ============================================================
  // Imperial: 662 lb rejected (above maximum)
  // ============================================================
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial", timezone: "America/New_York" }],
        body_metrics: [],
      },
    });
    
    const kg662lb = parseWeight("662", "imperial");
    if (kg662lb !== null) throw new Error("parseWeight should reject 662 lb");
    
    // Use raw conversion for testing rejection
    const manualKg = 662 * 0.453592;
    const result = await logBodyWeightCore(fake.client, "user-1", manualKg, "America/New_York");
    
    check("Imperial 662 lb: rejected", result.ok === false);
    check("Imperial 662 lb: error contains 'lb'", result.ok === false && result.error.includes("lb"));
    check("Imperial 662 lb: error contains '661'", result.ok === false && result.error.includes("661"));
    
    const rows = fake.tables.body_metrics.filter((r: Record<string, unknown>) => r.user_id === "user-1");
    check("Imperial 662 lb: no row inserted", rows.length === 0, `got ${rows.length} rows`);
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
    
    const result = await logBodyWeightCore(fake.client, "user-1", 25, "Europe/London");
    
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
    
    const result = await logBodyWeightCore(fake.client, "user-1", 24.9, "Europe/London");
    
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
    
    const result = await logBodyWeightCore(fake.client, "user-1", 300, "Europe/London");
    
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
    
    const result = await logBodyWeightCore(fake.client, "user-1", 300.1, "Europe/London");
    
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
