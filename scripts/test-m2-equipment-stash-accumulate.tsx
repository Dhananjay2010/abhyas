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
import { render, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';
import { getPendingChanges, type PendingChange } from '../src/lib/auth/pending-changes';

function hasEquipmentId(p: unknown, id: string): boolean {
  return p !== null && typeof p === 'object' && 'equipmentId' in p && p.equipmentId === id;
}

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
  const barbellPatch = equipmentChanges.find(ch => hasEquipmentId(ch.patch, 'barbell'));
  const kettlebellPatch = equipmentChanges.find(ch => hasEquipmentId(ch.patch, 'kettlebell'));

  if (!barbellPatch) {
    console.error('  ❌ Barbell change not found in stash (overwritten by kettlebell)');
    console.error(`     Stash contains: ${JSON.stringify(equipmentChanges.map(ch => ch.patch))}`);
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

  const { getAllByRole } = render(
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
  const barbellChips = getAllByRole('button', { name: /barbell/i, pressed: false });
  await user.click(barbellChips[0]);
  
  // Wait for async startTransition to complete and stashing to finish
  await waitFor(() => {
    const p = getPendingChanges(userId);
    if (!p) throw new Error('Waiting for stash after click 1');
  }, { timeout: 2000 });

  // Tap barbell again to disable it (now it's pressed:true, so query without pressed filter)
  const barbellChipsPressed = getAllByRole('button', { name: /barbell/i });
  const pressedBarbell = barbellChipsPressed.find(btn => btn.getAttribute('aria-pressed') === 'true');
  if (!pressedBarbell) {
    console.error('  ❌ No pressed barbell button found after first click');
    return false;
  }

  await user.click(pressedBarbell);
  
  // Wait for async startTransition to complete
  await waitFor(() => {
    const p = getPendingChanges(userId);
    if (!p) throw new Error('Waiting for stash after click 2');
    const equipChanges = p.changes.filter(ch => ch.type === 'equipment' && hasEquipmentId(ch.patch, 'barbell'));
    if (equipChanges.length === 0) throw new Error('Waiting for barbell change in stash');
  }, { timeout: 2000 });

  // Check stash
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    console.error('  ❌ No pending changes stashed');
    return false;
  }

  // Filter equipment changes for barbell
  const equipmentChanges = pending.changes.filter(ch => {
    if (ch.type !== 'equipment') return false;
    return hasEquipmentId(ch.patch, 'barbell');
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
  const patch = equipmentChanges[0].patch;
  const enabled = patch && typeof patch === 'object' && 'enabled' in patch ? patch.enabled : undefined;
  if (enabled !== false) {
    console.error(`  ❌ Latest barbell state should be disabled (false), got ${enabled}`);
    return false;
  }

  console.log('  ✓ Same item multiple taps keep only the latest state');
  return true;
}

(async () => {
  console.log('\n🧪 M2 Regression: Equipment taps overwrite stash entries\n');

  try {
    const result1 = await testM2_MultipleEquipmentTapsAccumulate();
    cleanup();
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
