#!/usr/bin/env tsx
/**
 * M2 Regression test: Equipment taps overwrite stash entries
 * 
 * This test verifies that multiple equipment taps while session is expired
 * accumulate in the stash instead of overwriting each other.
 * 
 * Expected to FAIL on bd82ecba (each tap overwrites previous stash entry).
 * Expected to PASS after fix (stash entries accumulate per equipmentId).
 */

import './helpers/setup-jsdom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';
import { getPendingChanges } from '../src/lib/auth/pending-changes';

const initialState: SettingsState = {
  goal: 'muscle_gain',
  level: 'intermediate',
  primaryTrack: 'weights',
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 45,
  hasAllEquipment: false,
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

const equipment = [
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
  { id: 'dumbbells', name: 'Dumbbells', category: 'free_weight' },
  { id: 'kettlebell', name: 'Kettlebell', category: 'free_weight' },
];

const timezones = ['America/New_York'];

async function testM2_MultipleEquipmentTapsAccumulate(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000001';

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      // All equipment changes return SESSION_EXPIRED
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

  // Tap barbell
  const barbellChip = getByText('Barbell');
  await user.click(barbellChip);

  // Wait for session expired handling
  await new Promise(resolve => setTimeout(resolve, 100));

  // Tap kettlebell
  const kettlebellChip = getByText('Kettlebell');
  await user.click(kettlebellChip);

  // Wait for session expired handling
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check stash
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    console.error('  ❌ No pending changes stashed');
    return false;
  }

  // Filter equipment changes
  const equipmentChanges = pending.changes.filter(ch => ch.type === 'equipment');
  
  if (equipmentChanges.length === 0) {
    console.error('  ❌ No equipment changes found in stash');
    return false;
  }

  // Check if both barbell and kettlebell are in the stash
  const patches = equipmentChanges.map(ch => ch.patch);
  const barbellPatch = patches.find((p: any) => p?.equipmentId === 'barbell');
  const kettlebellPatch = patches.find((p: any) => p?.equipmentId === 'kettlebell');

  if (!barbellPatch) {
    console.error('  ❌ Barbell change not found in stash (overwritten by kettlebell)');
    console.error(`     Stash contains: ${JSON.stringify(patches)}`);
    return false;
  }

  if (!kettlebellPatch) {
    console.error('  ❌ Kettlebell change not found in stash');
    return false;
  }

  console.log('  ✓ Both barbell and kettlebell changes are in the stash');
  console.log(`     Found ${equipmentChanges.length} equipment changes`);
  return true;
}

async function testM2_SameItemMultipleTapsKeepLatest(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000002';

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      // All equipment changes return SESSION_EXPIRED
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

  // Tap barbell to enable it
  const barbellChip = getByText('Barbell');
  await user.click(barbellChip);
  await new Promise(resolve => setTimeout(resolve, 100));

  // Tap barbell again to disable it
  await user.click(barbellChip);
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check stash
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    console.error('  ❌ No pending changes stashed');
    return false;
  }

  // Filter equipment changes for barbell
  const equipmentChanges = pending.changes.filter(ch => {
    if (ch.type !== 'equipment') return false;
    const patch = ch.patch as any;
    return patch?.equipmentId === 'barbell';
  });

  if (equipmentChanges.length === 0) {
    console.error('  ❌ No barbell changes found in stash');
    return false;
  }

  if (equipmentChanges.length > 1) {
    console.error(`  ❌ Multiple barbell changes in stash (${equipmentChanges.length}), should keep only latest`);
    return false;
  }

  // The latest state should be disabled (false), since we toggled twice
  const patch = equipmentChanges[0].patch as any;
  if (patch.enabled !== false) {
    console.error(`  ❌ Latest barbell state should be disabled (false), got ${patch.enabled}`);
    return false;
  }

  console.log('  ✓ Same item multiple taps keep only the latest state');
  return true;
}

(async () => {
  console.log('\n🧪 M2 Regression: Equipment taps overwrite stash entries\n');

  try {
    const result1 = await testM2_MultipleEquipmentTapsAccumulate();
    const result2 = await testM2_SameItemMultipleTapsKeepLatest();

    if (result1 && result2) {
      console.log('\n✅ All M2 tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some M2 tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
})();
