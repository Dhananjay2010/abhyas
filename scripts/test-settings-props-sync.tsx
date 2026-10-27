#!/usr/bin/env tsx
/**
 * Item 5: Props re-sync test
 * 
 * SettingsForm seeds state with useState(initial) and ignores new props.
 * When router.refresh() brings new server data, the form must re-sync
 * (unless saves are pending, then re-sync after queue drains).
 * 
 * Test 1: Idle form, props change -> form shows new values
 * Test 2: Local change pending, props change -> local kept, then new props after drain
 * 
 * Both tests MUST FAIL on main 82b877c7.
 */

import "./helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

const EQUIPMENT = [
  { id: "dumbbells", name: "Dumbbells", category: "free_weight" },
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const TIMEZONES = ["America/New_York", "America/Los_Angeles"];

const INITIAL_A: SettingsState = {
  goal: "strength",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  preferredSessionMinutes: 30,
  hasAllEquipment: false,
  equipmentIds: ["dumbbells"],
  injuries: [],
  planningMode: "progression",
  perSetLogging: true,
  resumeSession: true,
  cooldownEnabled: true,
  restAutostart: false,
  restSound: true,
  restVibrate: false,
  restOverrideSeconds: null,
  bodyweightPrompt: "weekly",
  timezone: "America/New_York",
  dateOfBirth: null,
  units: 'metric',
};

const INITIAL_B: SettingsState = {
  ...INITIAL_A,
  preferredSessionMinutes: 60,
  equipmentIds: ["dumbbells", "barbell"],
};

// Test 1: Idle form, props change -> form shows new values
async function test1PropsChangeWhenIdle() {
  console.log("\n📋 Test 1: Idle form, props change (30m→60m, [dumbbells]→[dumbbells,barbell]) -> DOM shows new values\n");
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container, rerender } = render(
    <SettingsForm 
      initial={INITIAL_A} 
      equipment={EQUIPMENT} 
      timezones={TIMEZONES} 
      actions={actions} 
    />
  );

  // Check initial state: 30m selected, only Dumbbells pressed
  const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button30Initial = buttons.find(b => b.textContent === "30m") as HTMLButtonElement;
  const button60Initial = buttons.find(b => b.textContent === "60m") as HTMLButtonElement;
  const dumbbellsInitial = buttons.find(b => b.textContent === "Dumbbells") as HTMLButtonElement;
  const barbellInitial = buttons.find(b => b.textContent === "Barbell") as HTMLButtonElement;

  assert(button30Initial?.getAttribute("aria-pressed") === "true", "Initial: 30m selected");
  assert(button60Initial?.getAttribute("aria-pressed") !== "true", "Initial: 60m not selected");
  assert(dumbbellsInitial?.getAttribute("aria-pressed") === "true", "Initial: Dumbbells selected");
  assert(barbellInitial?.getAttribute("aria-pressed") !== "true", "Initial: Barbell not selected");

  // Rerender with new props (simulating router.refresh())
  await act(async () => {
    rerender(
      <SettingsForm 
        initial={INITIAL_B} 
        equipment={EQUIPMENT} 
        timezones={TIMEZONES} 
        actions={actions} 
      />
    );
  });

  await new Promise(r => setTimeout(r, 100));

  // Check that DOM now shows 60m and both equipment items
  const buttonsAfter = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button30After = buttonsAfter.find(b => b.textContent === "30m") as HTMLButtonElement;
  const button60After = buttonsAfter.find(b => b.textContent === "60m") as HTMLButtonElement;
  const dumbbellsAfter = buttonsAfter.find(b => b.textContent === "Dumbbells") as HTMLButtonElement;
  const barbellAfter = buttonsAfter.find(b => b.textContent === "Barbell") as HTMLButtonElement;

  assert(button60After?.getAttribute("aria-pressed") === "true", "After rerender: 60m selected (re-synced)");
  assert(button30After?.getAttribute("aria-pressed") !== "true", "After rerender: 30m not selected");
  assert(dumbbellsAfter?.getAttribute("aria-pressed") === "true", "After rerender: Dumbbells selected");
  assert(barbellAfter?.getAttribute("aria-pressed") === "true", "After rerender: Barbell selected (re-synced)");

  cleanup();
}

// Test 2: Local change saves successfully, then props change -> new props applied
async function test2PropsChangeAfterSave() {
  console.log("\n📋 Test 2: Local change saves (45m), then props change (60m from another tab) -> props re-sync to 60m\n");
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => {
      await new Promise(r => setTimeout(r, 50));
      return { ok: true };
    },
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container, rerender } = render(
    <SettingsForm 
      initial={INITIAL_A} 
      equipment={EQUIPMENT} 
      timezones={TIMEZONES} 
      actions={actions} 
    />
  );

  // Click 45m and wait for save to complete
  const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button45 = buttons.find(b => b.textContent === "45m") as HTMLButtonElement;
  
  await act(async () => {
    button45.click();
  });

  await new Promise(r => setTimeout(r, 200));

  // Check 45m is now selected and saved
  const buttonsAfterSave = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button45AfterSave = buttonsAfterSave.find(b => b.textContent === "45m") as HTMLButtonElement;
  assert(button45AfterSave?.getAttribute("aria-pressed") === "true", "After save: 45m selected");

  // Now rerender with new props (60m from server, simulating another tab's save + router.refresh)
  await act(async () => {
    rerender(
      <SettingsForm 
        initial={INITIAL_B} 
        equipment={EQUIPMENT} 
        timezones={TIMEZONES} 
        actions={actions} 
      />
    );
  });

  await new Promise(r => setTimeout(r, 100));

  // Props should re-sync to 60m and barbell
  const buttonsFinal = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button45Final = buttonsFinal.find(b => b.textContent === "45m") as HTMLButtonElement;
  const button60Final = buttonsFinal.find(b => b.textContent === "60m") as HTMLButtonElement;
  const barbellFinal = buttonsFinal.find(b => b.textContent === "Barbell") as HTMLButtonElement;
  
  assert(button60Final?.getAttribute("aria-pressed") === "true", "After props change: 60m selected (re-synced from new props)");
  assert(button45Final?.getAttribute("aria-pressed") !== "true", "After props change: 45m not selected");
  assert(barbellFinal?.getAttribute("aria-pressed") === "true", "After props change: Barbell re-synced");

  cleanup();
}

// Run tests
(async () => {
  console.log("\n🧪 Settings props re-sync test (Item 5)\n");
  
  try {
    await test1PropsChangeWhenIdle();
    await test2PropsChangeAfterSave();
    
    console.log(`\n✅ All tests passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();