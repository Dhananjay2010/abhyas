import assert from "node:assert";
import { processRedeemResult } from "../src/lib/redeem-join-code-errors";
import { mapPreviewResultToMessage } from "../src/lib/preview-join-code-messages";

console.log("=== TEST: Gym join code actions-to-mapper wiring ===\n");

// Test processRedeemResult which is used by redeemJoinCode action

// Test that gym name is passed through to mapper for already_member
const alreadyMemberData = {
  ok: false,
  reason: "already_member",
};

const resultWithGym = processRedeemResult(alreadyMemberData, "PowerHouse Gym");
assert.strictEqual(resultWithGym.ok, false, "FAIL: already_member result should have ok=false");
if (!resultWithGym.ok) {
  assert.strictEqual(
    resultWithGym.error,
    "You're already in PowerHouse Gym",
    "FAIL: already_member with gym name should show personalized message"
  );
}
console.log("✓ already_member with gym name shows: 'You're already in PowerHouse Gym'");

const resultWithoutGym = processRedeemResult(alreadyMemberData);
assert.strictEqual(resultWithoutGym.ok, false, "FAIL: already_member result should have ok=false");
if (!resultWithoutGym.ok) {
  assert.strictEqual(
    resultWithoutGym.error,
    "You're already a member of this gym",
    "FAIL: already_member without gym name should show generic message"
  );
}
console.log("✓ already_member without gym name shows generic message");

// Test other failure reasons still work
const invalidData = { ok: false, reason: "invalid" };
const invalidResult = processRedeemResult(invalidData, "Any Gym");
assert.strictEqual(invalidResult.ok, false, "FAIL: invalid result should have ok=false");
if (!invalidResult.ok) {
  assert.strictEqual(
    invalidResult.error,
    "This code is invalid or no longer available",
    "FAIL: invalid result should not use gym name"
  );
}
console.log("✓ invalid result returns correct message");

const expiredData = { ok: false, reason: "expired" };
const expiredResult = processRedeemResult(expiredData);
assert.strictEqual(expiredResult.ok, false, "FAIL: expired result should have ok=false");
if (!expiredResult.ok) {
  assert.strictEqual(
    expiredResult.error,
    "This code has expired",
    "FAIL: expired result should return correct message"
  );
}
console.log("✓ expired result returns correct message");

const revokedData = { ok: false, reason: "revoked" };
const revokedResult = processRedeemResult(revokedData);
assert.strictEqual(revokedResult.ok, false, "FAIL: revoked result should have ok=false");
if (!revokedResult.ok) {
  assert.strictEqual(
    revokedResult.error,
    "This code has been revoked",
    "FAIL: revoked result should return correct message"
  );
}
console.log("✓ revoked result returns correct message");

const exhaustedData = { ok: false, reason: "exhausted" };
const exhaustedResult = processRedeemResult(exhaustedData);
assert.strictEqual(exhaustedResult.ok, false, "FAIL: exhausted result should have ok=false");
if (!exhaustedResult.ok) {
  assert.strictEqual(
    exhaustedResult.error,
    "This code has reached its maximum uses",
    "FAIL: exhausted result should return correct message"
  );
}
console.log("✓ exhausted result returns correct message");

const throttledData = { ok: false, reason: "throttled" };
const throttledResult = processRedeemResult(throttledData);
assert.strictEqual(throttledResult.ok, false, "FAIL: throttled result should have ok=false");
if (!throttledResult.ok) {
  assert.strictEqual(
    throttledResult.error,
    "Too many attempts. Please try again in a few minutes",
    "FAIL: throttled result should return correct message"
  );
}
console.log("✓ throttled result returns correct message");

// Test success case
const successData = { ok: true, gym_id: "123", gym_name: "Test Gym" };
const successResult = processRedeemResult(successData, "Test Gym");
assert.strictEqual(successResult.ok, true, "FAIL: success result should have ok=true");
if (successResult.ok) {
  assert.strictEqual(successResult.gymName, "Test Gym", "FAIL: success should return gym name");
}
console.log("✓ success result returns success with gym name");

console.log("\n=== TEST: Preview result mapping ===\n");

// Test preview failure messages (used in join page)
const previewInvalidResult = { ok: false as const, reason: "invalid" as const };
const previewInvalidMessage = mapPreviewResultToMessage(previewInvalidResult);
assert.strictEqual(
  previewInvalidMessage,
  "This invite code is invalid, expired, or no longer available.",
  "FAIL: preview invalid should show descriptive message"
);
console.log("✓ preview invalid shows: 'This invite code is invalid, expired, or no longer available.'");

const previewThrottledResult = { ok: false as const, reason: "throttled" as const };
const previewThrottledMessage = mapPreviewResultToMessage(previewThrottledResult);
assert.strictEqual(
  previewThrottledMessage,
  "You've made too many attempts. Please try again in a few minutes.",
  "FAIL: preview throttled should show descriptive message"
);
console.log("✓ preview throttled shows: 'You've made too many attempts. Please try again in a few minutes.'");

const previewSuccessResult = { ok: true as const, gym_name: "Test", gym_slug: "test", role: "member" };
const previewSuccessMessage = mapPreviewResultToMessage(previewSuccessResult);
assert.strictEqual(
  previewSuccessMessage,
  "",
  "FAIL: preview success should return empty string"
);
console.log("✓ preview success returns empty string");

console.log("\n✅ All actions-to-mapper tests passed");
