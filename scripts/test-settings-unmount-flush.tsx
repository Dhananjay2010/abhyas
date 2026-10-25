#!/usr/bin/env tsx
/**
 * MEDIUM 1: Settings soft navigation flush test
 * 
 * Test that pending saves are flushed when SettingsForm unmounts (simulating navigation).
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

// Test: Change toggle (queued save), unmount within 2s, assert save was called
async function testUnmountFlush() {
  console.log("\n📋 Test: Toggle change -> unmount within 2s -> save fires\n");
  
  const saveCalls: Array<{ type: string; patch: unknown }> = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => { 
      saveCalls.push({ type: "profile", patch }); 
      await new Promise(r => setTimeout(r, 100)); 
      return { ok: true }; 
    },
    updateSessionSettings: async (patch) => { 
      saveCalls.push({ type: "session", patch }); 
      await new Promise(r => setTimeout(r, 100)); 
      return { ok: true }; 
    },
    updateEquipment: async (patch) => { 
      saveCalls.push({ type: "equipment", patch }); 
      await new Promise(r => setTimeout(r, 100)); 
      return { ok: true }; 
    },
    updateInjuries: async (patch) => { 
      saveCalls.push({ type: "injury", patch }); 
      await new Promise(r => setTimeout(r, 100)); 
      return { ok: true };
    },
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { unmount, container } = render(
    <SettingsForm 
      initial={INITIAL_STATE} 
      equipment={EQUIPMENT} 
      timezones={TIMEZONES} 
      actions={actions} 
    />
  );

  // Find session length buttons
  const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button45m = buttons.find(b => b.textContent === "45m") as HTMLButtonElement | undefined;

  assert(!!button45m, "Found 45m button");

  // Click 45m to queue a save (this will be slow - 100ms)
  await act(async () => {
    button45m!.click();
  });

  // Unmount immediately without waiting (simulating navigation within ~2s)
  // The save is queued or in-flight but hasn't completed yet
  act(() => {
    unmount();
  });

  // Wait for the save to complete (should happen even after unmount)
  await new Promise(r => setTimeout(r, 300));

  // Assert the save was called
  const profileCalls = saveCalls.filter(c => c.type === "profile");
  assert(profileCalls.length > 0, `updateProfileSettings was called (got ${profileCalls.length} calls)`);
  
  const lastCall = profileCalls[profileCalls.length - 1];
  const patch = lastCall.patch as { preferred_session_minutes?: number };
  assert(patch.preferred_session_minutes === 45, `Save included preferred_session_minutes: 45 (got ${JSON.stringify(patch)})`);

  console.log(`\n  Final save: ${JSON.stringify(lastCall.patch)}`);
  
  cleanup();
}

// Run test
(async () => {
  console.log("\n🧪 Settings unmount flush test (MEDIUM 1)\n");
  
  try {
    await testUnmountFlush();
    
    console.log(`\n✅ Test passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
