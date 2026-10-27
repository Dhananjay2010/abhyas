#!/usr/bin/env tsx
/**
 * Test: N1 (b) - First item pick after has_all toggle retry path
 * 
 * This test verifies that when:
 * 1. User starts with has_all=true, no items
 * 2. User toggles has_all off and picks first item (Barbell)
 * 3. The save fails with a non-expiry error
 * 4. User hits Retry
 * 
 * The retry sends the atomic updateEquipment({hasAll: false, items: ['barbell']})
 * instead of just setEquipmentItem, which would leave has_all=true in the DB.
 * 
 * Expected to FAIL on e6a258f (retry only sends setItem).
 */

import './helpers/setup-jsdom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';

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

const equipment = [
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
  { id: 'dumbbells', name: 'Dumbbells', category: 'free_weight' },
];

const timezones = ['America/New_York'];

async function testN1_RetryFirstPickAfterHasAllOff(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000001';

  let firstAttempt = true;
  let updateEquipmentCalls = 0;
  let setEquipmentItemCalls = 0;
  let retryUpdateEquipmentData: { hasAll: boolean; equipmentIds: string[] } | null = null;

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async (input) => {
      updateEquipmentCalls++;
      if (firstAttempt) {
        firstAttempt = false;
        return { ok: false, error: 'Network error' };
      } else {
        retryUpdateEquipmentData = input;
        return { ok: true };
      }
    },
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      setEquipmentItemCalls++;
      return { ok: true };
    },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { getByText, queryByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Toggle "I have access to everything" off
  const hasAllButton = getByText('I have access to everything');
  await user.click(hasAllButton);

  // Wait for state update
  await new Promise(resolve => setTimeout(resolve, 100));

  // Pick Barbell (will fail)
  const barbellChip = getByText('Barbell');
  await user.click(barbellChip);

  // Wait for error to appear
  await waitFor(() => {
    const retryBtn = queryByText('Retry');
    return retryBtn !== null;
  }, { timeout: 3000 });

  console.log('  ✓ First attempt failed with network error');

  // Find and click Retry button
  const retryButton = queryByText('Retry');
  if (!retryButton) {
    console.error('  ❌ Retry button not found');
    return false;
  }

  await user.click(retryButton);

  // Wait for retry to complete
  await waitFor(() => {
    return updateEquipmentCalls >= 2 || setEquipmentItemCalls > 0;
  }, { timeout: 3000 });

  // Assert: updateEquipment was called on retry (not setEquipmentItem)
  if (setEquipmentItemCalls > 0) {
    console.error('  ❌ Retry called setEquipmentItem (should use updateEquipment for atomic op)');
    return false;
  }

  if (updateEquipmentCalls < 2) {
    console.error('  ❌ updateEquipment was not called on retry');
    return false;
  }

  if (!retryUpdateEquipmentData) {
    console.error('  ❌ Retry did not send data');
    return false;
  }
  
  const jsonData = JSON.stringify(retryUpdateEquipmentData);
  const parsed = JSON.parse(jsonData) as { hasAll: boolean; equipmentIds: string[] };
  
  if (parsed.hasAll !== false || !parsed.equipmentIds.includes('barbell')) {
    console.error('  ❌ Retry did not send correct data');
    console.error(`     Expected: { hasAll: false, equipmentIds: ['barbell'] }`);
    console.error(`     Got: ${jsonData}`);
    return false;
  }

  console.log('  ✓ Retry sent atomic updateEquipment({ hasAll: false, equipmentIds: ["barbell"] })');

  return true;
}

(async () => {
  console.log('\n🧪 Test: N1 (b) First item pick retry after has_all off\n');

  try {
    const result = await testN1_RetryFirstPickAfterHasAllOff();

    if (result) {
      console.log('\n✅ Test passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Test failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
})();