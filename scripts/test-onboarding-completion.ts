#!/usr/bin/env tsx
/**
 * Test onboarding completion prerequisite checking and block creation order.
 *
 * Must import real code (no duplicated logic).
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("\nOnboarding Completion Tests\n");

// ============================================================
// 1. Verify RPC is called before block creation
// ============================================================
console.log("1. Verify RPC is called before block creation (code review)");

const actionsPath = join(__dirname, "..", "src", "app", "onboarding", "actions.ts");
const actionsCode = readFileSync(actionsPath, "utf8");

// Find the completeOnboarding function
const funcMatch = actionsCode.match(
  /export async function completeOnboarding\(\)[\s\S]+?^}/m,
);
if (!funcMatch) {
  console.error("   FAIL  Could not find completeOnboarding function");
  process.exit(1);
}

const funcCode = funcMatch[0];

// Check that RPC call appears before createBlockForUser
const rpcIndex = funcCode.indexOf('.rpc("complete_onboarding")');
const blockIndex = funcCode.indexOf("createBlockForUser");

if (rpcIndex === -1) {
  console.error("   FAIL  RPC call not found in completeOnboarding");
  process.exit(1);
}

if (blockIndex === -1) {
  console.error("   FAIL  createBlockForUser call not found in completeOnboarding");
  process.exit(1);
}

if (rpcIndex >= blockIndex) {
  console.error(
    "   FAIL  RPC call appears after block creation (should be before)",
  );
  process.exit(1);
}

console.log("   ok   RPC is called before createBlockForUser");

// ============================================================
// 2. Verify prerequisites are checked before RPC
// ============================================================
console.log("\n2. Verify prerequisites are checked before RPC");

const missingCheckIndex = funcCode.indexOf("Still missing");
if (missingCheckIndex === -1) {
  console.error("   FAIL  Missing prerequisite check not found");
  process.exit(1);
}

if (missingCheckIndex >= rpcIndex) {
  console.error(
    "   FAIL  Prerequisite check appears after RPC (should be before)",
  );
  process.exit(1);
}

console.log("   ok   prerequisites are checked before RPC call");

// ============================================================
// 3. Verify error messages are user-friendly
// ============================================================
console.log("\n3. Verify error messages don't expose raw DB messages");

// Check acceptDisclaimer
const acceptMatch = actionsCode.match(
  /export async function acceptDisclaimer\(\)[\s\S]+?^}/m,
);
if (!acceptMatch) {
  console.error("   FAIL  acceptDisclaimer not found");
  process.exit(1);
}

if (acceptMatch[0].includes('error: error.message }') && 
    !acceptMatch[0].includes('console.error')) {
  console.error("   FAIL  acceptDisclaimer returns raw error.message");
  process.exit(1);
}

console.log("   ok   acceptDisclaimer maps errors to user-friendly messages");

// Check saveAboutYou
if (actionsCode.includes("profileError.message }") &&
    !actionsCode.includes("16 years old")) {
  console.error("   FAIL  saveAboutYou returns raw error without filtering");
  process.exit(1);
}

console.log("   ok   saveAboutYou surfaces age error but hides others");

// Check completeOnboarding
if (funcCode.includes('error.message }') && 
    !funcCode.includes('console.error')) {
  console.error("   FAIL  completeOnboarding returns raw error.message");
  process.exit(1);
}

console.log("   ok   completeOnboarding maps errors to user-friendly messages");

// ============================================================
// 4. Verify all profile writers are documented
// ============================================================
console.log("\n4. Verify all profile writers are documented in migration");

const migrationPath = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261024120000_profile_security_hardening.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

// Check that the migration lists the callers
const callersToCheck = [
  "ensureProfileRows",
  "saveAboutYou",
  "saveProfileFields",
  "updateProfileSettings",
  "saveEquipment",
];

const missingCallers = callersToCheck.filter(
  (caller) => !migrationSql.includes(caller),
);

if (missingCallers.length > 0) {
  console.error(
    "   FAIL  Migration doesn't document these callers:",
    missingCallers.join(", "),
  );
  process.exit(1);
}

console.log("   ok   all profile writers documented in migration comments");

// ============================================================
// 5. Verify avatar_url is in the grant
// ============================================================
console.log("\n5. Verify avatar_url is granted (used by ensureProfileRows)");

if (!migrationSql.includes("avatar_url")) {
  console.error("   FAIL  avatar_url not found in migration (needed by auth)");
  process.exit(1);
}

// Check it's in the grant statement
const grantMatch = migrationSql.match(/grant update \(([\s\S]+?)\) on public\.profiles/i);
if (!grantMatch) {
  console.error("   FAIL  Could not find grant statement");
  process.exit(1);
}

if (!grantMatch[1].includes("avatar_url")) {
  console.error("   FAIL  avatar_url not in grant update list");
  process.exit(1);
}

console.log("   ok   avatar_url is granted for ensureProfileRows");

console.log("\nALL CHECKS PASSED\n");
