/**
 * Today sign-out stash clearing test
 *
 * Verifies that the Today page's SignOutForm component clears pending changes
 * from sessionStorage when the user signs out.
 *
 * Run with: npm run test:today-signout-clears-stash
 */

import './helpers/setup-jsdom';
import { render, fireEvent } from '@testing-library/react';
import { SignOutForm } from '../src/app/today/signout-form';
import { stashPendingChanges, getPendingChanges, PendingChange } from '../src/lib/auth/pending-changes';

function runTest() {
  console.log('\nToday SignOutForm clears pending changes');

  // Set up test environment with some pending changes
  const testChanges: PendingChange[] = [
    {
      key: 'equipment',
      type: 'equipment',
      patch: { equipmentIds: ['1', '2'] },
      timestamp: Date.now()
    }
  ];
  
  stashPendingChanges(testChanges, '/settings', 'test-user');

  // Verify stash exists before sign-out
  let pending = getPendingChanges();
  if (!pending) {
    console.log('  FAIL Setup failed - could not stash changes');
    process.exit(1);
  }

  // Render the component
  const { container } = render(<SignOutForm label="Sign out" userId="test-user" />);
  const button = container.querySelector('button');
  
  if (!button) {
    console.log('  FAIL Could not find button element');
    process.exit(1);
  }

  // Click the sign-out button (this triggers the async sign-out flow)
  fireEvent.click(button);

  // Verify stash was cleared (clearPendingChanges is called at the start of handleSignOut)
  pending = getPendingChanges();
  
  if (pending !== null) {
    console.log('  FAIL Stash was not cleared on sign-out button click');
    console.log(`  Found: ${JSON.stringify(pending)}`);
    process.exit(1);
  }

  console.log('  ok   SignOutForm calls clearPendingChanges() on button click');
  console.log('  ok   Stash is cleared before sign-out attempt');
  console.log('\nALL CHECKS PASSED\n');
  process.exit(0);
}

runTest();
