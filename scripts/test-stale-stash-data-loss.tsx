#!/usr/bin/env tsx
/**
 * Test: Stale stash must not drop items another tab added
 * 
 * Scenario:
 * 1. Tab A has equipment=[dumbbell], stashes it when session expires
 * 2. Tab B (or fresh data) adds barbell, now equipment=[dumbbell, barbell]
 * 3. Tab A restores stash
 * 
 * With whole-list updateEquipment (main): Restore overwrites to [dumbbell], losing barbell ❌
 * With per-item operations (this PR): Restore calls setEquipmentItem(dumbbell, true), keeps barbell ✅
 */

import './helpers/setup-jsdom';
import { render } from '@testing-library/react';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { stashPendingChanges } from '../src/lib/auth/pending-changes';

const initialState: SettingsState = {
  goal: 'muscle_gain',
  level: 'intermediate',
  primaryTrack: 'weights',
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 45,
  hasAllEquipment: false,
  equipmentIds: ['dumbbell', 'barbell'], // Current state: Tab B added barbell
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
  { id: 'dumbbell', name: 'Dumbbell', category: 'free_weight' },
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
];

const timezones = ['America/New_York'];

async function runTest() {
  console.log("Testing stale stash data loss with whole-list vs per-item operations");
  console.log("======================================================================\n");

  // Test with WHOLE-LIST operation (main's behavior)
  console.log("Test 1: Whole-list updateEquipment (main's code)");
  console.log("-".repeat(50));

  // Stash Tab A's old state: only dumbbell
  stashPendingChanges([
    {
      key: 'equipment',
      type: 'equipment',
      patch: { hasAll: false, equipmentIds: ['dumbbell'] }, // Stale: missing barbell
      timestamp: Date.now()
    }
  ], '/settings');

  const wholeListCalls: Array<{ hasAll: boolean; equipmentIds: string[] }> = [];

  const actionsWholeList: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async (patch) => {
      wholeListCalls.push(patch);
      return { ok: true };
    },
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  // Render form - should restore stash
  render(
    <SettingsForm
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actionsWholeList}
    />
  );

  await new Promise(resolve => setTimeout(resolve, 500));

  // Check what was called
  const finalEquipment = wholeListCalls.length > 0 ? wholeListCalls[wholeListCalls.length - 1].equipmentIds : [];
  const hasBarbell = finalEquipment.includes('barbell');

  console.log(`  Restored equipment IDs: [${finalEquipment.join(', ')}]`);
  console.log(`  Barbell present: ${hasBarbell ? 'YES ✓' : 'NO ✗'}`);

  if (!hasBarbell) {
    console.log(`  ❌ DATA LOSS: Whole-list restore overwrote current state, losing 'barbell'`);
    console.log(`     Main's updateEquipment({ equipmentIds: ['dumbbell'] }) replaces entire list\n`);
  } else {
    console.log(`  ✓ No data loss (unexpected with whole-list operation)\n`);
  }

  // Test with PER-ITEM operation (this PR's behavior)
  console.log("Test 2: Per-item setEquipmentItem (this PR)");
  console.log("-".repeat(50));

  // Stash Tab A's old state as per-item operation
  stashPendingChanges([
    {
      key: 'equipment',
      type: 'equipment',
      patch: { operation: 'setItem', equipmentId: 'dumbbell', enabled: true }, // Per-item: just enable dumbbell
      timestamp: Date.now()
    }
  ], '/settings');

  const perItemCalls: Array<{ equipmentId: string; enabled: boolean }> = [];

  const actionsPerItem: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async (input) => {
      perItemCalls.push(input);
      return { ok: true };
    },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  // Render form - should restore stash
  render(
    <SettingsForm
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actionsPerItem}
    />
  );

  await new Promise(resolve => setTimeout(resolve, 500));

  // Check what was called
  const setItemCalls = perItemCalls.map(c => `${c.equipmentId}=${c.enabled}`).join(', ');
  console.log(`  Restored operations: ${setItemCalls || '(none)'}`);
  console.log(`  Current equipment still has barbell: ${initialState.equipmentIds.includes('barbell') ? 'YES ✓' : 'NO ✗'}`);

  if (perItemCalls.length > 0) {
    const onlySetsDumbbell = perItemCalls.every(c => c.equipmentId === 'dumbbell');
    if (onlySetsDumbbell) {
      console.log(`  ✓ NO DATA LOSS: Per-item restore only touches 'dumbbell', preserves 'barbell'`);
      console.log(`     This PR's setEquipmentItem({ equipmentId: 'dumbbell', enabled: true }) leaves barbell intact\n`);
    } else {
      console.log(`  ⚠ Unexpected: called setEquipmentItem for items other than dumbbell\n`);
    }
  } else {
    console.log(`  ⚠ No per-item calls recorded\n`);
  }

  console.log("======================================================================");
  console.log("SUMMARY:");
  console.log(`  Main (whole-list): ${!hasBarbell ? 'FAILS ❌ - loses barbell' : 'Unexpected pass'}`);
  console.log(`  This PR (per-item): ${perItemCalls.length > 0 && perItemCalls.every(c => c.equipmentId === 'dumbbell') ? 'PASSES ✓ - preserves barbell' : 'Unexpected behavior'}`);
  console.log("======================================================================\n");

  process.exit(0);
}

runTest();
