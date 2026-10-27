#!/usr/bin/env tsx
/**
 * Test: "Failed to fetch" is replaced with friendly message
 * 
 * This test verifies that raw "Failed to fetch" error text is replaced
 * with a user-friendly network error message.
 */

import './helpers/setup-jsdom';
import { render, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { stashPendingChanges, clearPendingChanges } from '../src/lib/auth/pending-changes';
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
  units: 'metric',
};

const equipment = [{ id: 'dumbbells', name: 'Dumbbells', category: 'free_weight' }];
const timezones = ['America/New_York'];

async function testFailedToFetchInRestorePending(): Promise<boolean> {
  const userId = 'test-user-123';
  resetSessionExpiredState();
  clearPendingChanges();

  // Seed the stash with a session change
  stashPendingChanges([
    {
      key: 'cooldown_enabled',
      type: 'session',
      patch: { cooldown_enabled: false },
      timestamp: Date.now()
    }
  ], '/settings', userId);

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => {
      // Simulate network error
      throw new Error('Failed to fetch');
    },
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  let container!: HTMLElement;
  
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
    const hasError = container.textContent?.includes("Couldn't restore your changes");
    return hasError === true;
  }, { timeout: 3000 });

  // Assert: Friendly message is shown
  const hasFriendlyMessage = container.textContent?.includes("Couldn't restore your changes");
  if (!hasFriendlyMessage) {
    console.error('  ❌ Friendly message not shown');
    return false;
  }

  // Assert: Raw "Failed to fetch" is NOT shown
  const hasRawError = container.textContent?.includes("Failed to fetch");
  if (hasRawError) {
    console.error('  ❌ Raw "Failed to fetch" text is still visible');
    return false;
  }

  console.log('  ✓ "Failed to fetch" replaced with friendly message in restore');

  return true;
}

async function testFailedToFetchInFieldSave(): Promise<boolean> {
  const userId = 'test-user-456';
  resetSessionExpiredState();
  clearPendingChanges();

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => {
      // Simulate network error
      throw new Error('Failed to fetch');
    },
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Click a toggle to trigger the save
  const toggle = container.querySelector('[role="switch"]');
  if (!toggle) {
    console.error('  ❌ Could not find toggle');
    return false;
  }

  await user.click(toggle);

  // Wait for error message
  await waitFor(() => {
    const hasError = container.textContent?.includes("Couldn't save");
    return hasError === true;
  }, { timeout: 3000 });

  // Assert: Friendly message is shown (getFriendlyError already handles this case)
  const hasFriendlyMessage = container.textContent?.includes("Couldn't save");
  if (!hasFriendlyMessage) {
    console.error('  ❌ Friendly message not shown for field save');
    return false;
  }

  // Assert: Raw "Failed to fetch" is NOT shown
  const hasRawError = container.textContent?.includes("Failed to fetch");
  if (hasRawError) {
    console.error('  ❌ Raw "Failed to fetch" text is still visible in field save');
    return false;
  }

  console.log('  ✓ "Failed to fetch" replaced with friendly message in field save');

  return true;
}

(async () => {
  console.log('\n🧪 Test: "Failed to fetch" friendly error messages\n');

  try {
    let allPassed = true;

    console.log('Test 1: "Failed to fetch" in restore pending changes');
    const result1 = await testFailedToFetchInRestorePending();
    if (!result1) {
      allPassed = false;
    }

    console.log('\nTest 2: "Failed to fetch" in field save');
    const result2 = await testFailedToFetchInFieldSave();
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