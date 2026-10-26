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

// Mock form submission to prevent actual navigation
let formSubmitPrevented = false;

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
  const form = container.querySelector('form');
  
  if (!form) {
    console.log('  FAIL Could not find form element');
    process.exit(1);
  }

  // Prevent actual form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    formSubmitPrevented = true;
  });

  // Simulate form submission
  fireEvent.submit(form);

  // Verify stash was cleared
  pending = getPendingChanges();
  
  if (pending !== null) {
    console.log('  FAIL Stash was not cleared on sign-out form submit');
    console.log(`  Found: ${JSON.stringify(pending)}`);
    process.exit(1);
  }

  if (!formSubmitPrevented) {
    console.log('  FAIL Form submit was not intercepted by test');
    process.exit(1);
  }

  console.log('  ok   SignOutForm calls clearPendingChanges() on submit');
  console.log('  ok   Stash is cleared before form submission');
  console.log('\nALL CHECKS PASSED\n');
  process.exit(0);
}

runTest();
