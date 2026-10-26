/**
 * Test planDay input validation (L5).
 *
 * Runtime validation must reject null/missing/invalid plan without throwing.
 *
 *   npx tsx scripts/test-plan-day-validation.ts
 */

import { strict as assert } from "node:assert";
import { validatePlanDayInput } from "../src/lib/session/validate-plan-day-input";

export {}; // Module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function main() {
  console.log("Testing planDay input validation\n");

  test("null plan returns error", () => {
    const error = validatePlanDayInput(null);
    assert.notEqual(error, null, "Should return error");
    assert.match(error ?? "", /plan/i, "Error should mention plan");
  });

  test("undefined plan returns error", () => {
    const error = validatePlanDayInput(undefined);
    assert.notEqual(error, null, "Should return error");
    assert.match(error ?? "", /plan/i, "Error should mention plan");
  });

  test("Empty object plan returns error", () => {
    const error = validatePlanDayInput({});
    assert.notEqual(error, null, "Should return error");
    assert.match(error ?? "", /kind/i, "Error should mention kind");
  });

  test("Plan with no kind returns error", () => {
    const error = validatePlanDayInput({ kind: null });
    assert.notEqual(error, null, "Should return error");
  });

  test("Plan with invalid kind returns error", () => {
    const error = validatePlanDayInput({ kind: "invalid" });
    assert.notEqual(error, null, "Should return error");
    assert.match(error ?? "", /type/i, "Error should mention type");
  });

  test("Plan with empty string kind returns error", () => {
    const error = validatePlanDayInput({ kind: "" });
    assert.notEqual(error, null, "Should return error");
  });

  test("Valid keep plan returns null", () => {
    const error = validatePlanDayInput({ kind: "keep" });
    assert.equal(error, null, "Should return null for valid plan");
  });

  test("Valid training plan returns null", () => {
    const error = validatePlanDayInput({ kind: "training", programDayId: "day-1" });
    assert.equal(error, null, "Should return null for valid plan");
  });

  test("Valid yoga plan returns null", () => {
    const error = validatePlanDayInput({ kind: "yoga" });
    assert.equal(error, null, "Should return null for valid plan");
  });

  test("Valid breathing plan returns null", () => {
    const error = validatePlanDayInput({ kind: "breathing" });
    assert.equal(error, null, "Should return null for valid plan");
  });

  test("Valid rest plan returns null", () => {
    const error = validatePlanDayInput({ kind: "rest" });
    assert.equal(error, null, "Should return null for valid plan");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
