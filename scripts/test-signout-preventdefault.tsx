#!/usr/bin/env tsx
/**
 * test-signout-preventdefault.tsx
 * Verify that SignOutForm and SignOutButton exist and can be imported.
 * 
 * These are client components that require full Next.js rendering context
 * including useRouter, useTransition, and auth state management.
 * Full behavioral testing requires browser integration tests.
 * 
 * This test verifies the components exist and contain preventDefault calls
 * by inspecting the source code.
 */

import assert from "node:assert/strict";
import * as fs from "fs";

async function testComponentsExist() {
  const { SignOutForm } = await import("../src/app/today/signout-form");
  const { SignOutButton } = await import("../src/app/settings/signout-button");
  
  assert.ok(SignOutForm, "SignOutForm should be importable");
  assert.strictEqual(typeof SignOutForm, "function", "SignOutForm should be a function");
  console.log("✅ SignOutForm exists and is a function");
  
  assert.ok(SignOutButton, "SignOutButton should be importable");
  assert.strictEqual(typeof SignOutButton, "function", "SignOutButton should be a function");
  console.log("✅ SignOutButton exists and is a function");
}

async function testPreventDefaultInSource() {
  // Read the source files to verify preventDefault is called
  const formSource = fs.readFileSync("src/app/today/signout-form.tsx", "utf8");
  const buttonSource = fs.readFileSync("src/app/settings/signout-button.tsx", "utf8");
  
  // Both should have preventDefault calls
  assert.ok(
    formSource.includes("e.preventDefault()") || formSource.includes("preventDefault"),
    "SignOutForm source contains preventDefault (mutant: removing e.preventDefault() must break this)"
  );
  console.log("✅ SignOutForm source contains preventDefault call");
  
  assert.ok(
    buttonSource.includes("e.preventDefault()") || buttonSource.includes("preventDefault"),
    "SignOutButton source contains preventDefault (mutant: removing e.preventDefault() must break this)"
  );
  console.log("✅ SignOutButton source contains preventDefault call");
  
  // Verify they handle pending sets
  assert.ok(
    formSource.includes("showWarning") || formSource.includes("pendingCount"),
    "SignOutForm handles pending sets warning"
  );
  console.log("✅ SignOutForm handles pending sets warning");
  
  assert.ok(
    buttonSource.includes("showWarning") || buttonSource.includes("pendingCount"),
    "SignOutButton handles pending sets warning"
  );
  console.log("✅ SignOutButton handles pending sets warning");
}

async function main() {
  console.log("Testing sign-out components...\n");
  
  try {
    await testComponentsExist();
    await testPreventDefaultInSource();
    
    console.log("\n✅ All sign-out component tests passed");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Tests failed");
    console.error(error);
    process.exit(1);
  }
}

main();
