#!/usr/bin/env tsx
/**
 * Test getProfileUnits with different profile states.
 */

import { getProfileUnits } from "@/lib/get-profile-units";
import { createFakeDb } from "./helpers/fake-postgrest";

console.log("\n🧪 getProfileUnits fallback behavior\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  // Imperial profile
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "imperial" }],
      },
    });
    
    const units = await getProfileUnits(fake.client, "user-1");
    check("Imperial profile returns 'imperial'", units === "imperial", `got '${units}'`);
  }

  // Metric profile
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "metric" }],
      },
    });
    
    const units = await getProfileUnits(fake.client, "user-1");
    check("Metric profile returns 'metric'", units === "metric", `got '${units}'`);
  }

  // Null units
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: null }],
      },
    });
    
    const units = await getProfileUnits(fake.client, "user-1");
    check("Null units falls back to 'metric'", units === "metric", `got '${units}'`);
  }

  // Garbage value
  {
    const fake = createFakeDb({
      tables: {
        profiles: [{ id: "user-1", units: "garbage" }],
      },
    });
    
    const units = await getProfileUnits(fake.client, "user-1");
    check("Garbage units falls back to 'metric'", units === "metric", `got '${units}'`);
  }

  // Missing profile
  {
    const fake = createFakeDb({
      tables: {
        profiles: [],
      },
    });
    
    const units = await getProfileUnits(fake.client, "user-1");
    check("Missing profile falls back to 'metric'", units === "metric", `got '${units}'`);
  }

  if (failures === 0) {
    console.log("\n✅ All checks passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} check(s) failed\n`);
    process.exit(1);
  }
})();
