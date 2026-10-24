#!/usr/bin/env tsx
/**
 * LOW 2: Old save failure must not revert when newer save is queued
 * 
 * Example: session length set to 45 then 60, the 45 request fails,
 * UI must stay at 60 (not revert to 30 the original).
 * 
 * This test MUST FAIL on main.
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

const INITIAL_STATE: SettingsState = {
  goal: "strength",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  preferredSessionMinutes: 30,
  hasAllEquipment: false,
  equipmentIds: [],
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
};

const EQUIPMENT = [
  { id: "dumbbells", name: "Dumbbells", category: "free_weight" },
];

const TIMEZONES = ["America/New_York", "America/Los_Angeles"];

// Test: Set to 45 (slow, fails), then quickly set to 60 (succeeds)
// When 45 fails, UI must stay at 60, not revert to 30
async function testNoOldRevert() {
  console.log("\n📋 Test: Set 45 (fails), then 60 (succeeds) -> UI stays at 60\n");
  
  let call45Resolve: ((result: Result) => void) | null = null;
  const call45Promise = new Promise<Result>(resolve => { call45Resolve = resolve; });
  
  let firstCall = true;
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => {
      const value = (patch as { preferred_session_minutes?: number }).preferred_session_minutes;
      
      if (firstCall && value === 45) {
        firstCall = false;
        // Hang, then fail
        const result = await call45Promise;
        return result;
      }
      
      // All other calls succeed quickly
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

  const { container } = render(
    <SettingsForm 
      initial={INITIAL_STATE} 
      equipment={EQUIPMENT} 
      timezones={TIMEZONES} 
      actions={actions} 
    />
  );

  const findButton = (label: string) => {
    const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
    return buttons.find(b => b.textContent === label) as HTMLButtonElement | undefined;
  };

  // Click 45m (will hang)
  const button45 = findButton("45m");
  assert(!!button45, "Found 45m button");
  
  await act(async () => {
    button45!.click();
  });

  await new Promise(r => setTimeout(r, 50));

  // Click 60m (will succeed quickly)
  const button60 = findButton("60m");
  assert(!!button60, "Found 60m button");
  
  await act(async () => {
    button60!.click();
  });

  await new Promise(r => setTimeout(r, 100));

  // Check UI shows 60m selected
  const button60After = findButton("60m");
  assert(button60After?.getAttribute("aria-pressed") === "true", "60m button is pressed after click");

  // Now fail the 45m call
  await act(async () => {
    call45Resolve!({ ok: false, error: "Network error" });
  });

  await new Promise(r => setTimeout(r, 200));

  // UI must still show 60m, not revert to 30m
  const button60Final = findButton("60m");
  const button30Final = findButton("30m");
  
  assert(button60Final?.getAttribute("aria-pressed") === "true", "60m button still pressed after 45m fails");
  assert(button30Final?.getAttribute("aria-pressed") !== "true", "30m button not pressed (not reverted to initial)");

  cleanup();
}

// Run test
(async () => {
  console.log("\n🧪 Settings old save failure test (LOW 2)\n");
  
  try {
    await testNoOldRevert();
    
    console.log(`\n✅ Test passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
