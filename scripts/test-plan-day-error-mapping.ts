#!/usr/bin/env tsx
/**
 * MED-1: Test friendlyPlanDayError allowlist behavior.
 * 
 * Raw errors (RLS, JWT expired, TypeError: fetch failed, permission denied, timeouts)
 * must NOT reach the user. Only core's own friendly messages pass through; everything
 * else maps to the generic "Couldn't save your choice. Please try again."
 */

import assert from "node:assert/strict";
import { friendlyPlanDayError, CORE_FRIENDLY_ERRORS } from "@/lib/session/friendly-plan-day-error";

const RAW_ERRORS = [
  'new row violates row-level security policy for table "planned_sessions"',
  "JWT expired",
  "TypeError: fetch failed",
  "permission denied for table planned_sessions",
  "connect ETIMEDOUT",
  "read ECONNRESET",
  "INTERNAL SERVER ERROR",
  "syntax error at or near",
  "duplicate key value violates unique constraint",
  "column \"user_id\" of relation \"sessions\" does not exist",
];

const GENERIC_COPY = "Couldn't save your choice. Please try again.";

function main() {
  console.log("Testing friendlyPlanDayError allowlist...\n");

  let failures = 0;
  function check(label: string, pass: boolean, detail?: string) {
    console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
    if (!pass) failures++;
  }

  // Test 1: Core's own friendly messages pass through unchanged
  console.log("1. Core friendly messages pass through");
  for (const friendly of CORE_FRIENDLY_ERRORS) {
    const result = friendlyPlanDayError(friendly);
    check(`"${friendly}" passes through`, result === friendly);
  }

  // Test 2: Raw errors map to generic copy
  console.log("\n2. Raw errors map to generic copy");
  for (const raw of RAW_ERRORS) {
    const result = friendlyPlanDayError(raw);
    check(
      `"${raw.slice(0, 40)}..." → generic`,
      result === GENERIC_COPY,
      result !== GENERIC_COPY ? `Got: "${result}"` : undefined
    );
    
    // Critical: ensure NO raw error text appears
    check(
      `No raw text in output`,
      !result.includes(raw.substring(0, 20)),
      result.includes(raw.substring(0, 20)) ? `Raw text leaked: ${result}` : undefined
    );
  }

  // Test 3: Verify the generic copy itself
  console.log("\n3. Generic copy verification");
  check("Generic copy is correct", GENERIC_COPY === "Couldn't save your choice. Please try again.");

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }

  console.log("\n✓ All friendlyPlanDayError checks passed");
}

main();
