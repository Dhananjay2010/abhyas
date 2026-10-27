#!/usr/bin/env tsx
/**
 * Test: N1 (a) - First item pick after has_all toggle is replayed correctly
 * 
 * This test verifies that when:
 * 1. User starts with has_all=true, no items
 * 2. Session expires
 * 3. User toggles has_all off and picks first item (Barbell)
 * 4. User signs in again
 * 
 * The replayed operation sends the atomic updateEquipment({hasAll: false, items: ['barbell']})
 * instead of just setEquipmentItem, which would leave has_all=true in the DB.
 * 
 * Expected to FAIL on e6a258f (stash only records setItem).
 */

import './helpers/setup-jsdom';
import { render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { getPendingChanges, clearPendingChanges } from '../src/lib/auth/pending-changes';
import { replayPendingOps } from '../src/lib/settings/restore-pending';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';

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

async function testN1_ReplayFirstPickAfterHasAllOff(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000001';
  clearPendingChanges();

  // Actions that return SESSION_EXPIRED for equipment changes
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => {
      return { ok: false, error: SESSION_EXPIRED_CODE, code: SESSION_EXPIRED_CODE };
    },
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      return { ok: false, error: SESSION_EXPIRED_CODE, code: SESSION_EXPIRED_CODE };
    },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { getByText } = render(
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

  // Pick Barbell
  const barbellChip = getByText('Barbell');
  await user.click(barbellChip);

  // Wait for session expiration handling
  await new Promise(resolve => setTimeout(resolve, 200));

  // Check stash
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    console.error('  ❌ No pending changes stashed');
    return false;
  }

  const equipmentChanges = pending.changes.filter(ch => ch.type === 'equipment');
  
  if (equipmentChanges.length === 0) {
    console.error('  ❌ No equipment changes found in stash');
    return false;
  }

  console.log('  ✓ Equipment change stashed');

  // Now simulate replay after sign-in
  let updateEquipmentCalled = false;
  let setEquipmentItemCalled = false;
  let updateEquipmentData: { hasAll: boolean; equipmentIds: string[] } | null = null;

  const replayActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async (input: { hasAll: boolean; equipmentIds: string[] }) => {
      updateEquipmentCalled = true;
      updateEquipmentData = input;
      return { ok: true };
    },
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      setEquipmentItemCalled = true;
      return { ok: true };
    },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  // Replay the stashed changes
  const { unrecognizedOps } = await replayPendingOps(pending.changes, replayActions);

  if (unrecognizedOps.length > 0) {
    console.error('  ❌ Unrecognized operations during replay:', unrecognizedOps);
    return false;
  }

  // Assert: updateEquipment was called with hasAll:false and barbell
  if (!updateEquipmentCalled) {
    console.error('  ❌ updateEquipment was not called during replay');
    console.error('     setEquipmentItem called instead:', setEquipmentItemCalled);
    return false;
  }

  if (setEquipmentItemCalled) {
    console.error('  ❌ setEquipmentItem was called (should use updateEquipment for atomic op)');
    return false;
  }

  if (!updateEquipmentData) {
    console.error('  ❌ updateEquipment was not called with data');
    return false;
  }
  
  const jsonData = JSON.stringify(updateEquipmentData);
  const parsed = JSON.parse(jsonData) as { hasAll: boolean; equipmentIds: string[] };
  
  if (parsed.hasAll !== false || !parsed.equipmentIds.includes('barbell')) {
    console.error('  ❌ updateEquipment was not called with correct data');
    console.error(`     Expected: { hasAll: false, equipmentIds: ['barbell'] }`);
    console.error(`     Got: ${jsonData}`);
    return false;
  }

  console.log('  ✓ Replay sent atomic updateEquipment({ hasAll: false, equipmentIds: ["barbell"] })');

  return true;
}

(async () => {
  console.log('\n🧪 Test: N1 (a) First item pick replay after has_all off\n');

  try {
    const result = await testN1_ReplayFirstPickAfterHasAllOff();

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