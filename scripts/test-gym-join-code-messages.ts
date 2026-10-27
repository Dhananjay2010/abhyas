/**
 * Unit tests for gym join code message mapping
 * 
 * Ensures every redeem failure reason maps to specific user-facing copy
 * and never falls through to the generic error message.
 */

import assert from "node:assert";
import { mapRedeemResultToMessage } from "../src/lib/gym-join-code-messages.js";
import type { RedeemJoinCodeResult } from "../src/lib/gym-join-code-types.js";

const gymName = "Test Gym";
const genericError = "An error occurred. Please try again";

console.log("TEST: mapRedeemResultToMessage exhaustive coverage");

// Test success case
const successResult: RedeemJoinCodeResult = { ok: true, gym_id: "123", gym_name: gymName };
const successMessage = mapRedeemResultToMessage(successResult, gymName);
assert.strictEqual(successMessage, "", "Success should return empty string");
console.log("✓ Success returns empty string");

// Test invalid reason
const invalidResult: RedeemJoinCodeResult = { ok: false, reason: "invalid" };
const invalidMessage = mapRedeemResultToMessage(invalidResult, gymName);
assert.strictEqual(invalidMessage, "This code is invalid or no longer available");
assert.notStrictEqual(invalidMessage, genericError, "Invalid should not return generic error");
console.log("✓ Invalid reason maps to specific copy");

// Test expired reason
const expiredResult: RedeemJoinCodeResult = { ok: false, reason: "expired" };
const expiredMessage = mapRedeemResultToMessage(expiredResult, gymName);
assert.strictEqual(expiredMessage, "This code has expired");
assert.notStrictEqual(expiredMessage, genericError, "Expired should not return generic error");
console.log("✓ Expired reason maps to specific copy");

// Test revoked reason
const revokedResult: RedeemJoinCodeResult = { ok: false, reason: "revoked" };
const revokedMessage = mapRedeemResultToMessage(revokedResult, gymName);
assert.strictEqual(revokedMessage, "This code has been revoked");
assert.notStrictEqual(revokedMessage, genericError, "Revoked should not return generic error");
console.log("✓ Revoked reason maps to specific copy");

// Test exhausted reason
const exhaustedResult: RedeemJoinCodeResult = { ok: false, reason: "exhausted" };
const exhaustedMessage = mapRedeemResultToMessage(exhaustedResult, gymName);
assert.strictEqual(exhaustedMessage, "This code has reached its maximum uses");
assert.notStrictEqual(exhaustedMessage, genericError, "Exhausted should not return generic error");
console.log("✓ Exhausted reason maps to specific copy");

// Test throttled reason
const throttledResult: RedeemJoinCodeResult = { ok: false, reason: "throttled" };
const throttledMessage = mapRedeemResultToMessage(throttledResult, gymName);
assert.strictEqual(throttledMessage, "Too many attempts. Please try again in a few minutes");
assert.notStrictEqual(throttledMessage, genericError, "Throttled should not return generic error");
console.log("✓ Throttled reason maps to specific copy");

// Test already_member reason with gym name
const alreadyMemberResult: RedeemJoinCodeResult = { ok: false, reason: "already_member" };
const alreadyMemberMessage = mapRedeemResultToMessage(alreadyMemberResult, gymName);
assert.strictEqual(alreadyMemberMessage, "You're already in Test Gym");
assert.notStrictEqual(alreadyMemberMessage, genericError, "Already_member should not return generic error");
console.log("✓ Already_member reason with gym name maps to specific copy");

// Test already_member reason without gym name
const alreadyMemberNoGymMessage = mapRedeemResultToMessage(alreadyMemberResult);
assert.strictEqual(alreadyMemberNoGymMessage, "You're already a member of this gym");
assert.notStrictEqual(alreadyMemberNoGymMessage, genericError, "Already_member without gym should not return generic error");
console.log("✓ Already_member reason without gym name maps to specific copy");

console.log();
console.log("All message mapping tests passed!");
