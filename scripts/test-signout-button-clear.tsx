#!/usr/bin/env tsx
/**
 * Test: SignOutButton clears pending sets (4b)
 * 
 * Renders SignOutButton with injected clear and signOut,
 * clicks it, and asserts clear is called with correct userId BEFORE signOut.
 */

import "./helpers/setup-jsdom";
import { render, act } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";

async function runTest() {
  console.log('\n=== SignOutButton Clear Pending Sets Test (4b) ===\n');
  
  const userId = 'u1';
  const callOrder: string[] = [];
  
  // Mock clearSets that records the call
  const mockClearSets = (_storage: unknown, uid: string) => {
    callOrder.push(`clear:${uid}`);
  };
  
  // Mock signOut that records the call
  const mockSignOut = async () => {
    callOrder.push('signOut');
    // Never returns (would redirect in real code)
    return new Promise(() => {}) as Promise<never>;
  };
  
  // Render SignOutButton with mocks
  const { container } = render(
    <SignOutButton 
      userId={userId}
      clearSets={mockClearSets}
      signOut={mockSignOut}
    />
  );
  
  const signOutButton = container.querySelector('button');
  if (!signOutButton) {
    console.log('✗ SignOutButton button not found');
    process.exit(1);
  }
  
  // Click the button
  await act(async () => {
    signOutButton.click();
    // Give React transition time to start
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  // Verify clear was called with correct userId
  if (callOrder.length === 0 || callOrder[0] !== `clear:${userId}`) {
    console.log(`✗ clearSets not called with userId ${userId}`);
    console.log(`  Call order: ${JSON.stringify(callOrder)}`);
    process.exit(1);
  }
  
  console.log(`✓ clearSets called with userId ${userId} before signOut`);
  console.log('\nTotal: 1, Passed: 1, Failed: 0\n');
}

runTest().catch((error) => {
  console.error('\n✗ Test suite crashed:', error);
  process.exit(1);
});
