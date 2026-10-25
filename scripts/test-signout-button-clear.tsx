#!/usr/bin/env tsx
/**
 * Test: SignOutButton clears pending sets (4b)
 * 
 * Tests that clicking SignOutButton removes pending-sets:<userId> from localStorage.
 */

import "./helpers/setup-jsdom";

import { render, act } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";

// Mock signOutAction to return success
import { createRequire } from "module";
const testRequire = createRequire(import.meta.url);
type ModuleLoadFunction = (request: string, parent: unknown, isMain: boolean) => unknown;
interface ModuleWithLoad {
  _load: ModuleLoadFunction;
}

const Module = testRequire("module") as unknown as ModuleWithLoad;
const originalLoad = Module._load;

Module._load = function (request: string, parent: unknown, isMain: boolean): unknown {
  if (request.endsWith("/lib/auth/signout")) {
    return {
      signOutAction: async () => {
        signOutCalled = true;
        return { ok: true };
      }
    };
  }
  if (request.endsWith("/lib/auth/pending-changes")) {
    return {
      clearPendingChanges: () => {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function runTest() {
  console.log('\n=== SignOutButton Clear Pending Sets Test (4b) ===\n');
  
  const userId = 'u1';
  const storageKey = `pending-sets:${userId}`;
  
  if (typeof window === 'undefined' || !window.localStorage) {
    console.log('✗ Test failed: localStorage not available');
    process.exit(1);
  }
  
  window.localStorage.setItem(storageKey, JSON.stringify([
    {
      sessionExerciseId: 'ex1',
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: 'test-1'
    }
  ]));
  
  const initialValue = window.localStorage.getItem(storageKey);
  if (!initialValue) {
    console.log('✗ Setup failed: pending sets not stored');
    process.exit(1);
  }
  console.log(`✓ Setup: pending-sets:u1 exists before click`);
  
  const { getByRole } = render(<SignOutButton userId={userId} />);
  
  const button = getByRole('button', { name: /sign out/i });
  
  await act(async () => {
    button.click();
    await new Promise(r => setTimeout(r, 50));
  });
  
  const finalValue = window.localStorage.getItem(storageKey);
  
  if (finalValue !== null) {
    console.log(`✗ Test failed: pending-sets:${userId} was not removed`);
    console.log(`  Value after click: ${finalValue}`);
    process.exit(1);
  }
  
  console.log('✓ SignOutButton clears pending-sets:u1 on click');
  console.log('\nTotal: 1, Passed: 1, Failed: 0\n');
}

runTest().catch((error) => {
  console.error('\n✗ Test suite crashed:', error);
  process.exit(1);
});
