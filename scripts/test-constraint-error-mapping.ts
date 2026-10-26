/**
 * Test constraint error mapping in log-bodyweight-core.
 *
 * Issue 5(b): A 23514 / body_metrics_weight_sane error maps to the lb copy
 * for imperial and the kg copy for metric, and an unrelated DB error is NOT remapped.
 *
 *   npx tsx scripts/test-constraint-error-mapping.ts
 */

import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logBodyWeightCore } from "../src/lib/progress/log-bodyweight-core";

export {}; // Module

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function makeFakeClient(config: {
  units: "imperial" | "metric";
  error?: { code?: string; message: string } | null;
}) {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => ({
                then: (resolve: (result: { data: { units: string } | null }) => void) => {
                  resolve({ data: { units: config.units } });
                },
              }),
            }),
          }),
        };
      }
      
      if (table === "body_metrics") {
        return {
          upsert: () => ({
            then: (resolve: (result: { error: typeof config.error }) => void) => {
              resolve({ error: config.error ?? null });
            },
          }),
        };
      }
      
      return {};
    },
  };
}

async function main() {
  console.log("Testing constraint error mapping\n");

  await test("23514 error with imperial units maps to lb message", async () => {
    const client = makeFakeClient({
      units: "imperial",
      error: { code: "23514", message: "violates check constraint body_metrics_weight_sane" },
    });
    
    const result = await logBodyWeightCore(client as unknown as SupabaseClient, "user-1", 500);
    
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert(result.error.includes("55.5"), `Should include min 55.5, got: ${result.error}`);
      assert(result.error.includes("661"), `Should include max 661, got: ${result.error}`);
      assert(result.error.includes("lb"), `Should include unit 'lb', got: ${result.error}`);
    }
  });

  await test("23514 error with metric units maps to kg message", async () => {
    const client = makeFakeClient({
      units: "metric",
      error: { code: "23514", message: "violates check constraint body_metrics_weight_sane" },
    });
    
    const result = await logBodyWeightCore(client as unknown as SupabaseClient, "user-1", 500);
    
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert(result.error.includes("25"), `Should include min 25, got: ${result.error}`);
      assert(result.error.includes("300"), `Should include max 300, got: ${result.error}`);
      assert(result.error.includes("kg"), `Should include unit 'kg', got: ${result.error}`);
    }
  });

  await test("body_metrics_weight_sane message without code 23514 also maps", async () => {
    const client = makeFakeClient({
      units: "imperial",
      error: { message: "new row violates check constraint body_metrics_weight_sane" },
    });
    
    const result = await logBodyWeightCore(client as unknown as SupabaseClient, "user-1", 500);
    
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert(result.error.includes("lb"), `Should map to lb message, got: ${result.error}`);
    }
  });

  await test("Unrelated DB error is NOT remapped", async () => {
    const client = makeFakeClient({
      units: "imperial",
      error: { code: "23503", message: "foreign key constraint violated" },
    });
    
    const result = await logBodyWeightCore(client as unknown as SupabaseClient, "user-1", 75);
    
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.error,
        "foreign key constraint violated",
        "Unrelated error should be returned as-is"
      );
    }
  });

  await test("Success case returns ok:true", async () => {
    const client = makeFakeClient({
      units: "imperial",
      error: null,
    });
    
    const result = await logBodyWeightCore(client as unknown as SupabaseClient, "user-1", 75);
    
    assert.equal(result.ok, true, "Should succeed when no error");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
