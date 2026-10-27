import assert from "node:assert";
import { splitJoinCodes, isCodeActive } from "../src/lib/split-join-codes";
import type { Database } from "../src/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

console.log("=== TEST: Split join codes into active/inactive ===\n");

// Helper to create a test code
function createCode(overrides: Partial<JoinCode>): JoinCode {
  return {
    id: "test-id",
    gym_id: "gym-id",
    code: "TESTCODE",
    role: "member",
    created_by: "user-id",
    created_at: new Date().toISOString(),
    expires_at: null,
    max_uses: null,
    use_count: 0,
    revoked_at: null,
    ...overrides,
  };
}

console.log("TEST: isCodeActive");

const activeCode = createCode({});
assert.strictEqual(isCodeActive(activeCode), true, "FAIL: code with no constraints should be active");
console.log("  ✓ code with no constraints is active");

const revokedCode = createCode({ revoked_at: new Date().toISOString() });
assert.strictEqual(isCodeActive(revokedCode), false, "FAIL: revoked code should be inactive");
console.log("  ✓ revoked code is inactive");

const expiredCode = createCode({ expires_at: new Date(Date.now() - 1000).toISOString() });
assert.strictEqual(isCodeActive(expiredCode), false, "FAIL: expired code should be inactive");
console.log("  ✓ expired code is inactive");

const futureCode = createCode({ expires_at: new Date(Date.now() + 86400000).toISOString() });
assert.strictEqual(isCodeActive(futureCode), true, "FAIL: code with future expiry should be active");
console.log("  ✓ code with future expiry is active");

const exhaustedCode = createCode({ max_uses: 5, use_count: 5 });
assert.strictEqual(isCodeActive(exhaustedCode), false, "FAIL: exhausted code should be inactive");
console.log("  ✓ exhausted code is inactive");

const notExhaustedCode = createCode({ max_uses: 5, use_count: 3 });
assert.strictEqual(isCodeActive(notExhaustedCode), true, "FAIL: code with remaining uses should be active");
console.log("  ✓ code with remaining uses is active");

const unlimitedCode = createCode({ max_uses: null, use_count: 100 });
assert.strictEqual(isCodeActive(unlimitedCode), true, "FAIL: unlimited code should be active regardless of use_count");
console.log("  ✓ unlimited code is active regardless of use_count");

// Test expiry boundary with fixed timestamp (LOW 3)
// Pass same timestamp to ensure deterministic comparison
const fixedNow = new Date("2024-01-15T12:00:00.000Z");
const expiresExactlyNowCode = createCode({ expires_at: fixedNow.toISOString() });
assert.strictEqual(isCodeActive(expiresExactlyNowCode, fixedNow), false, "FAIL: code that expires exactly now should be inactive (kills <= vs < mutant)");
console.log("  ✓ code that expires exactly now is inactive (boundary test)\n");

console.log("TEST: splitJoinCodes");

const codes: JoinCode[] = [
  createCode({ id: "1", code: "ACTIVE1" }),
  createCode({ id: "2", code: "REVOKED", revoked_at: new Date().toISOString() }),
  createCode({ id: "3", code: "ACTIVE2", expires_at: new Date(Date.now() + 86400000).toISOString() }),
  createCode({ id: "4", code: "EXPIRED", expires_at: new Date(Date.now() - 1000).toISOString() }),
  createCode({ id: "5", code: "EXHAUSTED", max_uses: 1, use_count: 1 }),
  createCode({ id: "6", code: "ACTIVE3" }),
];

const { active, inactive } = splitJoinCodes(codes);

assert.strictEqual(active.length, 3, "FAIL: should have 3 active codes");
assert.strictEqual(inactive.length, 3, "FAIL: should have 3 inactive codes");
console.log("  ✓ correctly splits 6 codes into 3 active and 3 inactive");

const activeCodes = active.map(c => c.code).sort();
const expectedActive = ["ACTIVE1", "ACTIVE2", "ACTIVE3"];
assert.deepStrictEqual(activeCodes, expectedActive, "FAIL: active codes should be ACTIVE1, ACTIVE2, ACTIVE3");
console.log("  ✓ active codes are: ACTIVE1, ACTIVE2, ACTIVE3");

const inactiveCodes = inactive.map(c => c.code).sort();
const expectedInactive = ["EXHAUSTED", "EXPIRED", "REVOKED"];
assert.deepStrictEqual(inactiveCodes, expectedInactive, "FAIL: inactive codes should be REVOKED, EXPIRED, EXHAUSTED");
console.log("  ✓ inactive codes are: EXHAUSTED, EXPIRED, REVOKED\n");

console.log("TEST: empty list");
const empty = splitJoinCodes([]);
assert.strictEqual(empty.active.length, 0, "FAIL: empty list should have 0 active");
assert.strictEqual(empty.inactive.length, 0, "FAIL: empty list should have 0 inactive");
console.log("  ✓ empty list produces empty active and inactive arrays\n");

console.log("TEST: all active");
const allActive = splitJoinCodes([
  createCode({ id: "1" }),
  createCode({ id: "2" }),
]);
assert.strictEqual(allActive.active.length, 2, "FAIL: should have 2 active");
assert.strictEqual(allActive.inactive.length, 0, "FAIL: should have 0 inactive");
console.log("  ✓ all active codes produce only active array\n");

console.log("TEST: all inactive");
const allInactive = splitJoinCodes([
  createCode({ id: "1", revoked_at: new Date().toISOString() }),
  createCode({ id: "2", expires_at: new Date(Date.now() - 1000).toISOString() }),
]);
assert.strictEqual(allInactive.active.length, 0, "FAIL: should have 0 active");
assert.strictEqual(allInactive.inactive.length, 2, "FAIL: should have 2 inactive");
console.log("  ✓ all inactive codes produce only inactive array\n");

console.log("TEST: expiry boundary mutant (flips <= to <)");
// This mutant test verifies that changing <= to < would be caught
// If the implementation used < instead of <=, a code expiring exactly now would be active
const mutantFixedNow = new Date("2024-01-15T12:00:00.000Z");
const mutantExpiresNowCode = createCode({ expires_at: mutantFixedNow.toISOString() });

// With <= (correct): code expiring exactly now is inactive
assert.strictEqual(
  isCodeActive(mutantExpiresNowCode, mutantFixedNow),
  false,
  "FAIL: Mutant M1 survived - code expiring exactly now should be inactive"
);
console.log("  ✓ M1: Mutant killed (flipping <= to < would make test fail)\n");

console.log("✅ All split-join-codes tests passed");
