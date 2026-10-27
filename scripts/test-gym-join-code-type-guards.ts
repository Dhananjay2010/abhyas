/**
 * Unit tests for gym join code type guards
 * 
 * Run: npx tsx scripts/test-gym-join-code-type-guards.ts
 */

import { parsePreviewJoinCodeResult, parseRedeemJoinCodeResult, parseCreateJoinCodeResult } from "../src/lib/gym-join-code-types.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("=== Type Guard Tests: preview_join_code ===\n");

// Valid success result
const previewSuccess = parsePreviewJoinCodeResult({
  ok: true,
  gym_name: "Test Gym",
  gym_slug: "test-gym",
  role: "member",
});
check("Preview success: ok=true", previewSuccess?.ok === true);
check("Preview success: has gym_name", previewSuccess?.ok === true && previewSuccess.gym_name === "Test Gym");
check("Preview success: has gym_slug", previewSuccess?.ok === true && previewSuccess.gym_slug === "test-gym");
check("Preview success: has role", previewSuccess?.ok === true && previewSuccess.role === "member");

// Valid failure result (invalid)
const previewInvalid = parsePreviewJoinCodeResult({
  ok: false,
  reason: "invalid",
});
check("Preview invalid: ok=false", previewInvalid?.ok === false);
check("Preview invalid: reason=invalid", previewInvalid?.ok === false && previewInvalid.reason === "invalid");

// Valid failure result (throttled)
const previewThrottled = parsePreviewJoinCodeResult({
  ok: false,
  reason: "throttled",
});
check("Preview throttled: ok=false", previewThrottled?.ok === false);
check("Preview throttled: reason=throttled", previewThrottled?.ok === false && previewThrottled.reason === "throttled");

// Invalid inputs
check("Preview null input", parsePreviewJoinCodeResult(null) === null);
check("Preview undefined input", parsePreviewJoinCodeResult(undefined) === null);
check("Preview string input", parsePreviewJoinCodeResult("invalid") === null);
check("Preview number input", parsePreviewJoinCodeResult(42) === null);
check("Preview array input", parsePreviewJoinCodeResult([]) === null);
check("Preview empty object", parsePreviewJoinCodeResult({}) === null);
check("Preview missing ok", parsePreviewJoinCodeResult({ gym_name: "Test" }) === null);
check("Preview ok=true missing fields", parsePreviewJoinCodeResult({ ok: true }) === null);
check("Preview ok=true missing gym_name", parsePreviewJoinCodeResult({ ok: true, gym_slug: "test", role: "member" }) === null);
check("Preview ok=false invalid reason", parsePreviewJoinCodeResult({ ok: false, reason: "expired" }) === null);
check("Preview ok=false missing reason", parsePreviewJoinCodeResult({ ok: false }) === null);

console.log("\n=== Type Guard Tests: redeem_join_code ===\n");

// Valid success result
const redeemSuccess = parseRedeemJoinCodeResult({
  ok: true,
  gym_id: "123e4567-e89b-12d3-a456-426614174000",
  gym_name: "Test Gym",
});
check("Redeem success: ok=true", redeemSuccess?.ok === true);
check("Redeem success: has gym_id", redeemSuccess?.ok === true && redeemSuccess.gym_id === "123e4567-e89b-12d3-a456-426614174000");
check("Redeem success: has gym_name", redeemSuccess?.ok === true && redeemSuccess.gym_name === "Test Gym");

// Valid failure results
const reasons = ["invalid", "expired", "revoked", "exhausted", "throttled", "already_member"] as const;
for (const reason of reasons) {
  const result = parseRedeemJoinCodeResult({ ok: false, reason });
  check(`Redeem ${reason}: ok=false`, result?.ok === false);
  check(`Redeem ${reason}: reason=${reason}`, result?.ok === false && result.reason === reason);
}

// Invalid inputs
check("Redeem null input", parseRedeemJoinCodeResult(null) === null);
check("Redeem undefined input", parseRedeemJoinCodeResult(undefined) === null);
check("Redeem string input", parseRedeemJoinCodeResult("invalid") === null);
check("Redeem number input", parseRedeemJoinCodeResult(42) === null);
check("Redeem array input", parseRedeemJoinCodeResult([]) === null);
check("Redeem empty object", parseRedeemJoinCodeResult({}) === null);
check("Redeem missing ok", parseRedeemJoinCodeResult({ gym_id: "123", gym_name: "Test" }) === null);
check("Redeem ok=true missing fields", parseRedeemJoinCodeResult({ ok: true }) === null);
check("Redeem ok=true missing gym_id", parseRedeemJoinCodeResult({ ok: true, gym_name: "Test" }) === null);
check("Redeem ok=false invalid reason", parseRedeemJoinCodeResult({ ok: false, reason: "unknown" }) === null);
check("Redeem ok=false missing reason", parseRedeemJoinCodeResult({ ok: false }) === null);

console.log("\n=== Type Guard Tests: create_join_code ===\n");

// Valid result (table with one row)
const createSuccess = parseCreateJoinCodeResult([
  { id: "123e4567-e89b-12d3-a456-426614174000", code: "ABCDEF2345" }
]);
check("Create success: non-null", createSuccess !== null);
check("Create success: has id", createSuccess?.id === "123e4567-e89b-12d3-a456-426614174000");
check("Create success: has code", createSuccess?.code === "ABCDEF2345");

// Invalid inputs
check("Create null input", parseCreateJoinCodeResult(null) === null);
check("Create undefined input", parseCreateJoinCodeResult(undefined) === null);
check("Create string input", parseCreateJoinCodeResult("invalid") === null);
check("Create number input", parseCreateJoinCodeResult(42) === null);
check("Create empty array", parseCreateJoinCodeResult([]) === null);
check("Create empty object", parseCreateJoinCodeResult({}) === null);
check("Create array of non-objects", parseCreateJoinCodeResult(["test"]) === null);
check("Create array missing id", parseCreateJoinCodeResult([{ code: "TEST" }]) === null);
check("Create array missing code", parseCreateJoinCodeResult([{ id: "123" }]) === null);
check("Create array wrong types", parseCreateJoinCodeResult([{ id: 123, code: "TEST" }]) === null);

console.log();

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}

console.log("✅ All type guard tests passed\n");
process.exit(0);
