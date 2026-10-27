import assert from "node:assert";
import { mapRedeemResultToMessage } from "../src/lib/gym-join-code-messages";

console.log("=== TEST: Gym join code actions-to-mapper wiring ===\n");

// Test that gym name is passed through to mapper for already_member
const alreadyMemberResult = {
  ok: false as const,
  reason: "already_member" as const,
};

const messageWithGym = mapRedeemResultToMessage(alreadyMemberResult, "PowerHouse Gym");
assert.strictEqual(
  messageWithGym,
  "You're already in PowerHouse Gym",
  "FAIL: already_member with gym name should show personalized message"
);
console.log("✓ already_member with gym name shows: 'You're already in PowerHouse Gym'");

const messageWithoutGym = mapRedeemResultToMessage(alreadyMemberResult);
assert.strictEqual(
  messageWithoutGym,
  "You're already a member of this gym",
  "FAIL: already_member without gym name should show generic message"
);
console.log("✓ already_member without gym name shows generic message");

// Test other failure reasons still work
const invalidResult = {
  ok: false as const,
  reason: "invalid" as const,
};
const invalidMessage = mapRedeemResultToMessage(invalidResult, "Any Gym");
assert.strictEqual(
  invalidMessage,
  "This code is invalid or no longer available",
  "FAIL: invalid result should not use gym name"
);
console.log("✓ invalid result returns correct message");

const expiredResult = {
  ok: false as const,
  reason: "expired" as const,
};
const expiredMessage = mapRedeemResultToMessage(expiredResult);
assert.strictEqual(
  expiredMessage,
  "This code has expired",
  "FAIL: expired result should return correct message"
);
console.log("✓ expired result returns correct message");

const revokedResult = {
  ok: false as const,
  reason: "revoked" as const,
};
const revokedMessage = mapRedeemResultToMessage(revokedResult);
assert.strictEqual(
  revokedMessage,
  "This code has been revoked",
  "FAIL: revoked result should return correct message"
);
console.log("✓ revoked result returns correct message");

const exhaustedResult = {
  ok: false as const,
  reason: "exhausted" as const,
};
const exhaustedMessage = mapRedeemResultToMessage(exhaustedResult);
assert.strictEqual(
  exhaustedMessage,
  "This code has reached its maximum uses",
  "FAIL: exhausted result should return correct message"
);
console.log("✓ exhausted result returns correct message");

const throttledResult = {
  ok: false as const,
  reason: "throttled" as const,
};
const throttledMessage = mapRedeemResultToMessage(throttledResult);
assert.strictEqual(
  throttledMessage,
  "Too many attempts. Please try again in a few minutes",
  "FAIL: throttled result should return correct message"
);
console.log("✓ throttled result returns correct message");

// Test success case (should return empty string)
const successResult = {
  ok: true as const,
  gym_id: "123",
  gym_name: "Test Gym",
};
const successMessage = mapRedeemResultToMessage(successResult as never, "Test Gym");
assert.strictEqual(
  successMessage,
  "",
  "FAIL: success result should return empty string"
);
console.log("✓ success result returns empty string");

console.log("\n✅ All actions-to-mapper tests passed");
