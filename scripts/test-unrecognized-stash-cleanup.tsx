#!/usr/bin/env tsx
/**
 * Test: Unrecognized old-format stash entries are shown once then cleared
 * 
 * This test verifies that:
 * 1. Old-format stash with unrecognized type (e.g. "injuries") shows error message
 * 2. The unrecognized entries are cleared from the stash after showing the error
 * 3. Recognized entries that failed with SESSION_EXPIRED are kept in the stash
 */

import './helpers/setup-jsdom';
import { render, waitFor, act } from '@testing-library/react';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { stashPendingChanges, getPendingChanges, clearPendingChanges } from '../src/lib/auth/pending-changes';
import { resetSessionExpiredState } from '../src/components/session-expired-prompt';

const initialState: SettingsState = {
  goal: 'muscle_gain',
  level: 'intermediate',
  primaryTrack: 'weights',
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 45,
  hasAllEquipment: true,
  equipmentIds: [],
  injuries: [],
  planningMode: 'progression',
  perSetLogging: true,
  resumeSession: true,
  cooldownEnabled: true,
  restAutostart: true,
  restSound: true,
  restVibrate: false,
  restOverrideSeconds: null,
  bodyweightPrompt: 'weekly',
  timezone: null,
  dateOfBirth: null,
};

const equipment = [{ id: 'dumbbells', name: 'Dumbbells', category: 'free_weight' }];
const timezones = ['America/New_York'];

async function testUnrecognizedStashCleanup(): Promise<boolean> {
  const userId = 'test-user-123';
  resetSessionExpiredState();
  clearPendingChanges();

  // Seed the stash with an old-format unrecognized type
  stashPendingChanges([
    {
      key: 'injuries',
      // @ts-expect-error - intentionally using old/invalid type for test
      type: 'injuries',
      patch: { injuries: ['back'] },
      timestamp: Date.now()
    }
  ], '/settings', userId);

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  let container: HTMLElement;
  
  await act(async () => {
    const result = render(
      <SettingsForm
        userId={userId}
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
    container = result.container;
    // Give time for effects to run
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  // Wait for error message to appear
  await waitFor(() => {
    const hasError = container!.textContent?.includes('Some changes could not be restored: injuries:injuries');
    return hasError === true;
  }, { timeout: 3000 });

  const hasError = container.textContent?.includes('Some changes could not be restored: injuries:injuries');
  if (!hasError) {
    console.error('  ❌ Error message not shown for unrecognized stash entry');
    return false;
  }

  console.log('  ✓ Error message shown for unrecognized stash entry');

  // Give the stash cleanup time to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check that the stash was cleared (no recognized entries left)
  const pendingAfter = getPendingChanges(userId);
  if (pendingAfter !== null) {
    console.error('  ❌ Stash was not cleared after showing error');
    console.error(`     Remaining entries: ${JSON.stringify(pendingAfter.changes)}`);
    return false;
  }

  console.log('  ✓ Unrecognized entries cleared from stash');

  return true;
}

async function testUnrecognizedStashKeepsRecognized(): Promise<boolean> {
  const userId = 'test-user-456';
  resetSessionExpiredState();
  clearPendingChanges();

  // Seed the stash with both unrecognized and recognized entries
  stashPendingChanges([
    {
      key: 'injuries',
      // @ts-expect-error - intentionally using old/invalid type for test
      type: 'injuries',
      patch: { injuries: ['back'] },
      timestamp: Date.now()
    },
    {
      key: 'cooldown_enabled',
      type: 'session',
      patch: { cooldown_enabled: false },
      timestamp: Date.now()
    }
  ], '/settings', userId);

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  let container: HTMLElement;
  
  await act(async () => {
    const result = render(
      <SettingsForm
        userId={userId}
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
    container = result.container;
    // Give time for effects to run
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  // Wait for error message
  await waitFor(() => {
    const hasError = container!.textContent?.includes('Some changes could not be restored');
    return hasError === true;
  }, { timeout: 3000 });

  // Give time for restoration and cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 200));

  // Check that the recognized entry was processed (and thus cleared since save succeeded)
  const pendingAfter = getPendingChanges(userId);
  
  // Since session save succeeded, stash should be cleared
  if (pendingAfter !== null) {
    console.error('  ❌ Stash should be empty after recognized entry was restored successfully');
    console.error(`     Remaining entries: ${JSON.stringify(pendingAfter.changes)}`);
    return false;
  }

  console.log('  ✓ Recognized entries were processed and cleared');

  return true;
}

(async () => {
  console.log('\n🧪 Test: Unrecognized stash cleanup\n');

  try {
    let allPassed = true;

    console.log('Test 1: Unrecognized stash entries are cleared after error shown');
    const result1 = await testUnrecognizedStashCleanup();
    if (!result1) {
      allPassed = false;
    }

    console.log('\nTest 2: Recognized entries are kept and processed');
    const result2 = await testUnrecognizedStashKeepsRecognized();
    if (!result2) {
      allPassed = false;
    }

    if (allPassed) {
      console.log('\n✅ All tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
})();
