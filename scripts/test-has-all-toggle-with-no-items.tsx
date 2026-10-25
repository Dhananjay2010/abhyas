#!/usr/bin/env tsx
/**
 * Test: User who onboarded with "I have access to everything" can turn it off
 * 
 * This test verifies that a user with has_all=true and no equipment items can:
 * 1. Toggle has_all off (flips local state, shows list and hint)
 * 2. No save action is called until an item is picked
 * 3. Picking the first item saves has_all=false with that item together
 * 
 * Expected to FAIL on 6e61cf7f (guard returns before flipping state).
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
};

const equipment = [
  { id: 'dumbbells', name: 'Dumbbells', category: 'free_weight' },
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
];

const timezones = ['America/New_York'];

type UpdateEquipmentInput = { hasAll: boolean; equipmentIds: string[] };

async function testHasAllToggleWithNoItems(): Promise<boolean> {
  const userId = '00000000-0000-0000-0000-000000000001';
  let saveEquipmentCalled = false;
  let updateEquipmentCalled = false;
  let updateEquipmentData: UpdateEquipmentInput | null = null;

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async (input: { hasAll: boolean; equipmentIds: string[] }) => {
      updateEquipmentCalled = true;
      updateEquipmentData = input;
      return { ok: true };
    },
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async (input) => {
      saveEquipmentCalled = true;
      return { ok: true };
    },
    setHasAllEquipment: async () => {
      console.error('  ❌ setHasAllEquipment should not be called');
      return { ok: true };
    },
    setInjury: async () => ({ ok: true }),
  };

  const { getByText, getAllByRole, queryByText } = render(
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

  // Wait a bit for state updates
  await new Promise(resolve => setTimeout(resolve, 100));

  // Assert: The list should be visible
  const dumbbell = queryByText('Dumbbells');
  if (!dumbbell) {
    console.error('  ❌ Equipment list not visible after toggling has_all off');
    return false;
  }

  // Assert: The hint should be visible
  const hint = queryByText(/Pick at least one item/);
  if (!hint) {
    console.error('  ❌ Hint not visible after toggling has_all off');
    return false;
  }

  console.log('  ✓ List and hint are visible');

  // Assert: No save action was called yet
  if (saveEquipmentCalled || updateEquipmentCalled) {
    console.error('  ❌ Save action was called before picking an item');
    return false;
  }

  console.log('  ✓ No save action called before picking an item');

  // Pick Dumbbells
  const dumbbellButton = getByText('Dumbbells');
  await user.click(dumbbellButton);

  // Wait for the save to complete
  await waitFor(() => {
    if (!updateEquipmentCalled) {
      throw new Error('Waiting for updateEquipment to be called');
    }
  }, { timeout: 2000 });

  // Assert: updateEquipment was called with has_all=false and the item
  if (!updateEquipmentCalled) {
    console.error('  ❌ updateEquipment was not called');
    return false;
  }

  if (saveEquipmentCalled) {
    console.error('  ❌ setEquipmentItem was called instead of updateEquipment');
    return false;
  }

  if (!updateEquipmentData) {
    console.error('  ❌ updateEquipment was not called');
    return false;
  }
  
  // Check using JSON to avoid TypeScript narrowing issues
  const jsonData = JSON.stringify(updateEquipmentData);
  const parsed = JSON.parse(jsonData) as { hasAll: boolean; equipmentIds: string[] };
  
  if (parsed.hasAll !== false || !parsed.equipmentIds.includes('dumbbells')) {
    console.error('  ❌ updateEquipment was not called with correct data');
    console.error(`     Expected: { hasAll: false, equipmentIds: ['dumbbells'] }`);
    console.error(`     Got: ${jsonData}`);
    return false;
  }

  console.log('  ✓ Picking Dumbbells saved has_all=false with the item');

  // LOW: Assert that hint is cleared after successful save
  await new Promise(resolve => setTimeout(resolve, 100));
  const hintAfterSave = queryByText(/Pick at least one item/);
  if (hintAfterSave) {
    console.error('  ❌ Hint was not cleared after successful save');
    return false;
  }

  console.log('  ✓ Hint cleared after successful save');

  return true;
}

(async () => {
  console.log('\n🧪 Test: User with has_all=true can turn it off\n');

  try {
    const result = await testHasAllToggleWithNoItems();

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
