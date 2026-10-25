#!/usr/bin/env tsx
/**
 * Test: SignOutButton clears pending sets (4b)
 * 
 * Renders SignOutButton, clicks it, and asserts localStorage pending-sets:u1 is gone.
 */

import "./helpers/setup-jsdom";
import { render, act } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";

async function runTest() {
  console.log('\n=== SignOutButton Clear Pending Sets Test (4b) ===\n');
  
  // Create a fake Storage implementation
  const store = new Map<string, string>();
  const fakeStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  
  const userId = 'u1';
  const storageKey = `pending-sets:${userId}`;
  
  fakeStorage.setItem(storageKey, JSON.stringify([
    {
      sessionExerciseId: 'ex1',
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: 'test-1'
    }
  ]));
  
  const initialValue = fakeStorage.getItem(storageKey);
  if (!initialValue) {
    console.log('✗ Setup failed: pending sets not stored');
    process.exit(1);
  }
  console.log(`✓ Setup: pending-sets:u1 exists before clear`);
  
  // Override window.localStorage with fakeStorage
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  // Render SignOutButton with userId="u1"
  const { container } = render(<SignOutButton userId={userId} />);
  
  // Find and click the sign out button
  const signOutButton = container.querySelector('button');
  if (!signOutButton) {
    console.log('✗ SignOutButton button not found');
    process.exit(1);
  }
  
  await act(async () => {
    signOutButton.click();
    // Give the async handler time to execute clearAllPendingSetsForUser
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  
  const finalValue = fakeStorage.getItem(storageKey);
  
  if (finalValue !== null) {
    console.log(`✗ Test failed: pending-sets:${userId} was not removed`);
    console.log(`  Value after clear: ${finalValue}`);
    process.exit(1);
  }
  
  console.log('✓ SignOutButton click removes pending-sets:u1');
  console.log('\nTotal: 1, Passed: 1, Failed: 0\n');
}

runTest().catch((error) => {
  console.error('\n✗ Test suite crashed:', error);
  process.exit(1);
});
