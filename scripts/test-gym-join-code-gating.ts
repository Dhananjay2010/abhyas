import assert from "node:assert";
import { determineJoinGating } from "../src/lib/gym-join-code-gating";

console.log("=== TEST: JoinConfirmation role-gating logic ===\n");

// Test: No existing role (new user)
console.log("TEST: New user (no existing role)");
const newUserMember = determineJoinGating(undefined, "member");
assert.strictEqual(newUserMember.alreadyInAtSameOrHigher, false, "FAIL: new user should not be blocked");
assert.strictEqual(newUserMember.isMemberUpgradeToStaff, false, "FAIL: new user should not be upgrade");
console.log("  ✓ New user redeeming member code: not blocked, not upgrade");

const newUserStaff = determineJoinGating(undefined, "staff");
assert.strictEqual(newUserStaff.alreadyInAtSameOrHigher, false, "FAIL: new user should not be blocked");
assert.strictEqual(newUserStaff.isMemberUpgradeToStaff, false, "FAIL: new user should not be upgrade");
console.log("  ✓ New user redeeming staff code: not blocked, not upgrade");

// Test: Owner redeeming any code (blocked)
console.log("\nTEST: Owner redeeming codes (should be blocked)");
const ownerToMember = determineJoinGating("owner", "member");
assert.strictEqual(ownerToMember.alreadyInAtSameOrHigher, true, "FAIL: owner should be blocked from member code");
assert.strictEqual(ownerToMember.isMemberUpgradeToStaff, false, "FAIL: owner to member is not upgrade");
console.log("  ✓ Owner redeeming member code: blocked");

const ownerToStaff = determineJoinGating("owner", "staff");
assert.strictEqual(ownerToStaff.alreadyInAtSameOrHigher, true, "FAIL: owner should be blocked from staff code");
assert.strictEqual(ownerToStaff.isMemberUpgradeToStaff, false, "FAIL: owner to staff is not upgrade");
console.log("  ✓ Owner redeeming staff code: blocked");

const ownerToOwner = determineJoinGating("owner", "owner");
assert.strictEqual(ownerToOwner.alreadyInAtSameOrHigher, true, "FAIL: owner should be blocked from owner code");
assert.strictEqual(ownerToOwner.isMemberUpgradeToStaff, false, "FAIL: owner to owner is not upgrade");
console.log("  ✓ Owner redeeming owner code: blocked");

// Test: Staff redeeming codes
console.log("\nTEST: Staff redeeming codes");
const staffToMember = determineJoinGating("staff", "member");
assert.strictEqual(staffToMember.alreadyInAtSameOrHigher, true, "FAIL: staff should be blocked from member code");
assert.strictEqual(staffToMember.isMemberUpgradeToStaff, false, "FAIL: staff to member is not upgrade");
console.log("  ✓ Staff redeeming member code: blocked (already higher)");

const staffToStaff = determineJoinGating("staff", "staff");
assert.strictEqual(staffToStaff.alreadyInAtSameOrHigher, true, "FAIL: staff should be blocked from staff code");
assert.strictEqual(staffToStaff.isMemberUpgradeToStaff, false, "FAIL: staff to staff is not upgrade");
console.log("  ✓ Staff redeeming staff code: blocked (already same)");

const staffToOwner = determineJoinGating("staff", "owner");
assert.strictEqual(staffToOwner.alreadyInAtSameOrHigher, false, "FAIL: staff should not be blocked from owner code");
assert.strictEqual(staffToOwner.isMemberUpgradeToStaff, false, "FAIL: staff to owner is not upgrade");
console.log("  ✓ Staff redeeming owner code: not blocked (promotion)");

// Test: Member redeeming codes
console.log("\nTEST: Member redeeming codes");
const memberToMember = determineJoinGating("member", "member");
assert.strictEqual(memberToMember.alreadyInAtSameOrHigher, true, "FAIL: member should be blocked from member code");
assert.strictEqual(memberToMember.isMemberUpgradeToStaff, false, "FAIL: member to member is not upgrade");
console.log("  ✓ Member redeeming member code: blocked (already same)");

const memberToStaff = determineJoinGating("member", "staff");
assert.strictEqual(memberToStaff.alreadyInAtSameOrHigher, false, "FAIL: member should not be blocked from staff code");
assert.strictEqual(memberToStaff.isMemberUpgradeToStaff, true, "FAIL: member to staff IS an upgrade");
console.log("  ✓ Member redeeming staff code: not blocked, IS UPGRADE");

const memberToOwner = determineJoinGating("member", "owner");
assert.strictEqual(memberToOwner.alreadyInAtSameOrHigher, false, "FAIL: member should not be blocked from owner code");
assert.strictEqual(memberToOwner.isMemberUpgradeToStaff, false, "FAIL: member to owner is not staff upgrade");
console.log("  ✓ Member redeeming owner code: not blocked, not staff upgrade (promotion)");

console.log("\n✅ All role-gating tests passed");
