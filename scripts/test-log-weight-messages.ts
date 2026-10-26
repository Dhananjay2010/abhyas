/**
 * Test LogWeight validation messages.
 *
 * Issue 5(a): Test the parseWeight validation that LogWeight uses
 * and verify the error messages use the correct constants.
 *
 *   npx tsx scripts/test-log-weight-messages.ts
 */

import { strict as assert } from "node:assert";
import { 
  parseWeight, 
  BODY_WEIGHT_LB_MIN,
  BODY_WEIGHT_LB_MAX,
  WEIGHT_KG_MIN,
  WEIGHT_KG_MAX,
} from "../src/lib/units";

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

async function main() {
  console.log("Testing LogWeight validation messages\n");

  await test("Imperial: 55 lb is rejected (below BODY_WEIGHT_LB_MIN of 55.5)", async () => {
    const result = parseWeight("55", "imperial");
    assert.equal(result, null, "55 lb should be rejected as too low");
    assert(BODY_WEIGHT_LB_MIN > 55, `BODY_WEIGHT_LB_MIN should be > 55, got ${BODY_WEIGHT_LB_MIN}`);
  });

  await test("Imperial: 55.5 lb is accepted (exactly BODY_WEIGHT_LB_MIN)", async () => {
    const result = parseWeight("55.5", "imperial");
    assert.notEqual(result, null, "55.5 lb should be accepted");
  });

  await test("Imperial: 661 lb is accepted (exactly BODY_WEIGHT_LB_MAX)", async () => {
    const result = parseWeight("661", "imperial");
    assert.notEqual(result, null, "661 lb should be accepted");
  });

  await test("Imperial: 662 lb is rejected (above BODY_WEIGHT_LB_MAX)", async () => {
    const result = parseWeight("662", "imperial");
    assert.equal(result, null, "662 lb should be rejected as too high");
  });

  await test("Metric: 24 kg is rejected (below WEIGHT_KG_MIN of 25)", async () => {
    const result = parseWeight("24", "metric");
    assert.equal(result, null, "24 kg should be rejected as too low");
    assert(WEIGHT_KG_MIN >= 25, `WEIGHT_KG_MIN should be >= 25, got ${WEIGHT_KG_MIN}`);
  });

  await test("Metric: 25 kg is accepted (exactly WEIGHT_KG_MIN)", async () => {
    const result = parseWeight("25", "metric");
    assert.notEqual(result, null, "25 kg should be accepted");
  });

  await test("Metric: 300 kg is accepted (exactly WEIGHT_KG_MAX)", async () => {
    const result = parseWeight("300", "metric");
    assert.notEqual(result, null, "300 kg should be accepted");
  });

  await test("Metric: 301 kg is rejected (above WEIGHT_KG_MAX)", async () => {
    const result = parseWeight("301", "metric");
    assert.equal(result, null, "301 kg should be rejected as too high");
  });

  await test("log-weight.tsx uses correct constants in error messages", async () => {
    // Read the file to verify it uses the constants
    const { readFileSync } = await import("node:fs");
    const content = readFileSync("src/app/progress/log-weight.tsx", "utf-8");
    
    // Verify imperial message uses BODY_WEIGHT_LB_MIN and BODY_WEIGHT_LB_MAX
    assert(
      content.includes("BODY_WEIGHT_LB_MIN") && content.includes("BODY_WEIGHT_LB_MAX"),
      "Imperial error message should use BODY_WEIGHT_LB_MIN and BODY_WEIGHT_LB_MAX constants"
    );
    
    // Verify metric message uses WEIGHT_KG_MIN and WEIGHT_KG_MAX
    assert(
      content.includes("WEIGHT_KG_MIN") && content.includes("WEIGHT_KG_MAX"),
      "Metric error message should use WEIGHT_KG_MIN and WEIGHT_KG_MAX constants"
    );
    
    // Verify no hardcoded 55 in the error messages (the old bug)
    const errorMessageSection = content.substring(
      content.indexOf('Weight should be between'),
      content.lastIndexOf('kg`') + 10
    );
    
    // Check that "55" doesn't appear as a hardcoded number in the error messages
    const hasHardcoded55 = /Weight should be between 55 and/.test(errorMessageSection);
    assert(!hasHardcoded55, "Error message should NOT contain hardcoded '55'");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
