#!/usr/bin/env tsx
/**
 * M1 Regression test: Rebuild prompt never shows after per-item saves
 * 
 * This test verifies that the "Rebuild my block" prompt appears after
 * changes to session-length, equipment, or injuries through per-item operations.
 * 
 * Expected to FAIL on bd82ecba (per-item saves never call setPlanStale).
 * Expected to PASS after fix (per-item saves set planStale for plan-affecting changes).
 */

import './helpers/setup-jsdom';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';

const initialState: SettingsState = {
  goal: 'muscle_gain',
  level: 'intermediate',
  primaryTrack: 'weights',
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 45,
  hasAllEquipment: false,
  equipmentIds: ['barbell', 'dumbbells'],
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
  { id: 'kettlebell', name: 'Kettlebell', category: 'free_weight' },
];

const timezones = ['America/New_York'];

async function testM1_RebuildPromptAfterEquipmentChange(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000001';
  let equipmentChanged = false;

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => {
      equipmentChanged = true;
      return { ok: true };
    },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { getAllByRole, queryAllByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Click kettlebell to add it (plan-affecting change)
  const kettlebellButtons = getAllByRole('button', { name: /kettlebell/i, pressed: false });
  await user.click(kettlebellButtons[0]);

  // Wait for the save to complete
  await waitFor(() => {
    if (!equipmentChanged) throw new Error('Equipment not changed yet');
  }, { timeout: 2000 });

  // Wait a bit for state updates
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check if rebuild prompt appears
  const rebuildPrompts = queryAllByText(/rebuild.*block/i);
  const rebuildPrompt = rebuildPrompts.length > 0 ? rebuildPrompts[0] : null;
  
  if (!rebuildPrompt) {
    console.error('  ❌ Rebuild prompt did not appear after equipment change');
    return false;
  }

  console.log('  ✓ Rebuild prompt appeared after equipment change');
  return true;
}

async function testM1_RebuildPromptAfterInjuryChange(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000002';

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => {
      return { ok: true };
    },
  };

  const { getAllByRole, queryAllByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Click shoulder injury to add it (plan-affecting change)
  const shoulderButtons = getAllByRole('button', { name: /shoulder/i, pressed: false });
  if (shoulderButtons.length === 0) {
    throw new Error('No shoulder buttons found');
  }
  await user.click(shoulderButtons[0]);

  // Wait for the rebuild prompt to appear after the save completes
  await waitFor(() => {
    const rebuildPrompts = queryAllByText(/rebuild.*block/i);
    if (rebuildPrompts.length === 0) {
      throw new Error('Rebuild prompt did not appear yet');
    }
  }, { timeout: 3000 });

  console.log('  ✓ Rebuild prompt appeared after injury change');
  return true;
}

async function testM1_RebuildPromptAfterSessionLengthChange(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000003';

  const actions: SettingsActions = {
    updateProfileSettings: async () => {
      return { ok: true };
    },
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { getAllByRole, queryAllByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Click the 60-minute session length option (labeled as "60m")
  const sixtyMinButtons = getAllByRole('button', { name: /60m/i });
  await user.click(sixtyMinButtons[0]);

  // Wait for the rebuild prompt to appear after the save completes
  await waitFor(() => {
    const rebuildPrompts = queryAllByText(/rebuild.*block/i);
    if (rebuildPrompts.length === 0) {
      throw new Error('Rebuild prompt did not appear yet');
    }
  }, { timeout: 3000 });

  console.log('  ✓ Rebuild prompt appeared after session length change');
  return true;
}

async function testM1_RebuildPromptSurvivesPropsSync(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000004';

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { getAllByRole, queryAllByText, rerender } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Click kettlebell to trigger rebuild prompt
  const kettlebellButtons = getAllByRole('button', { name: /kettlebell/i, pressed: false });
  await user.click(kettlebellButtons[0]);

  // Wait for rebuild prompt to appear
  await waitFor(() => {
    const rebuildPrompts = queryAllByText(/rebuild.*block/i);
    if (rebuildPrompts.length === 0) {
      throw new Error('Rebuild prompt did not appear yet');
    }
  }, { timeout: 3000 });

  console.log('  ✓ Rebuild prompt appeared after equipment change');

  // Simulate a revalidate by rerendering with updated props (like after a save)
  const updatedState = { ...initialState, equipmentIds: [...initialState.equipmentIds, 'kettlebell'] };
  act(() => {
    rerender(
      <SettingsForm
        userId={userId}
        initial={updatedState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
  });

  // Wait a bit for the rerender to settle
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check if rebuild prompt is STILL visible
  const rebuildPromptsAfterRerender = queryAllByText(/rebuild.*block/i);
  if (rebuildPromptsAfterRerender.length === 0) {
    console.error('  ❌ Rebuild prompt vanished after props sync (M1 bug)');
    return false;
  }

  console.log('  ✓ Rebuild prompt survived props sync');
  return true;
}

(async () => {
  console.log('\n🧪 M1 Regression: Rebuild prompt never shows after per-item saves\n');

  try {
    const result1 = await testM1_RebuildPromptAfterEquipmentChange();
    const result2 = await testM1_RebuildPromptAfterInjuryChange();
    const result3 = await testM1_RebuildPromptAfterSessionLengthChange();
    const result4 = await testM1_RebuildPromptSurvivesPropsSync();

    if (result1 && result2 && result3 && result4) {
      console.log('\n✅ All M1 tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some M1 tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
})();
