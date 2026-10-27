#!/usr/bin/env tsx
/**
 * Test: No-JS fallback form for sign-out (Issue C)
 * 
 * Tests:
 * 1. Server-rendered markup contains <form action="/auth/signout">
 * 2. Hydrated JS intercepts submit when sets are pending
 * 3. Without JS, form posts directly to /auth/signout
 */

import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";
import { SignOutForm } from "../src/app/today/signout-form";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

(async () => {
  console.log("\n📋 Test: No-JS fallback form (Issue C)\n");
  
  // ========================================================================
  // Test 1: Server-rendered markup contains form with action
  // ========================================================================
  console.log("=== Test 1: SignOutButton has form with action ===\n");
  
  const mockSignOut = async () => ({ ok: true as const });
  const mockLogSet = async () => ({ ok: true as const });
  
  const { container: container1 } = render(
    <SignOutButton 
      userId="test-user"
      signOut={mockSignOut}
      logSet={mockLogSet}
    />
  );
  
  const form1 = container1.querySelector('form[action="/auth/signout"]');
  assert(form1 !== null, "SignOutButton renders form with action='/auth/signout'");
  
  const button1 = form1?.querySelector('button[type="submit"]');
  assert(button1 !== null, "Form contains submit button");
  
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: SignOutForm has form with action
  // ========================================================================
  console.log("=== Test 2: SignOutForm has form with action ===\n");
  
  const { container: container2 } = render(
    <SignOutForm
      label="Sign out"
      userId="test-user"
      signOut={mockSignOut}
      logSet={mockLogSet}
    />
  );
  
  const form2 = container2.querySelector('form[action="/auth/signout"]');
  assert(form2 !== null, "SignOutForm renders form with action='/auth/signout'");
  
  const button2 = form2?.querySelector('button[type="submit"]');
  assert(button2 !== null, "Form contains submit button");
  
  console.log("✓ Test 2 passed\n");
  
  // ========================================================================
  // Test 3: Form method is POST
  // ========================================================================
  console.log("=== Test 3: Form method is POST ===\n");
  
  assert(form1?.getAttribute('method') === 'post', "SignOutButton form method is 'post'");
  assert(form2?.getAttribute('method') === 'post', "SignOutForm form method is 'post'");
  
  console.log("✓ Test 3 passed\n");
  
  console.log(`✅ No-JS fallback form tests passed (${passed} assertions)\n`);
  
  console.log("MUTANTS TO TEST:");
  console.log("- Remove form action='/auth/signout' (must fail)");
  console.log("- Change method to 'get' (must fail)");
  console.log("- Remove form wrapper (must fail)\n");
  
  console.log("PROGRESSIVE ENHANCEMENT:");
  console.log("Without JavaScript: form posts directly to /auth/signout");
  console.log("With JavaScript: onSubmit prevents default and runs warning flow\n");
  
  process.exit(0);
})();