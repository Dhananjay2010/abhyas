#!/usr/bin/env tsx
/**
 * Test: getProfileUnits returns metric fallback on profile read failure
 * 
 * When the profile read fails (network error, timeout, etc.), getProfileUnits
 * must return "metric" as a safe fallback, never showing kg to lb users.
 */

import { getProfileUnits } from "../src/lib/get-profile-units";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTest: getProfileUnits fallback on profile read failure\n");

// Mock client that simulates profile read error
function createFailingClient(errorMsg: string): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: { message: errorMsg, code: "PGRST000", details: "", hint: "" },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// Mock client that throws exception
function createThrowingClient(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            throw new Error("Network timeout");
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// Mock client that returns null profile
function createNullProfileClient(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// Mock client that returns imperial
function createImperialClient(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { units: "imperial" },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

async function main() {
  console.log("1. Profile read error returns metric fallback");
  {
    const client = createFailingClient("Connection timeout");
    const units = await getProfileUnits(client, "user-1");
    check("Error case returns 'metric'", units === "metric", `got: ${units}`);
  }

  console.log("\n2. Throwing client returns metric fallback");
  {
    const client = createThrowingClient();
    const units = await getProfileUnits(client, "user-1");
    check("Throw case returns 'metric'", units === "metric", `got: ${units}`);
  }

  console.log("\n3. Null profile returns metric fallback");
  {
    const client = createNullProfileClient();
    const units = await getProfileUnits(client, "user-1");
    check("Null profile returns 'metric'", units === "metric", `got: ${units}`);
  }

  console.log("\n4. Valid imperial profile returns 'imperial'");
  {
    const client = createImperialClient();
    const units = await getProfileUnits(client, "user-1");
    check("Valid imperial returns 'imperial'", units === "imperial", `got: ${units}`);
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
