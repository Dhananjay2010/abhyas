#!/usr/bin/env tsx
/**
 * Test 1: Triple-tap session length and verify toggles stay enabled.
 * 
 * Tap session length 3 times fast (30m, 75m, 45m) and assert that, 
 * after the saves settle, all toggles and the Timezone picker are 
 * ENABLED again and the server's final value is the last tap (45m).
 * 
 * This test MUST FAIL on main before the fix.
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

console.log("\n🧪 Test 1: Triple-tap session length - toggles stay enabled\n");

const initialState: SettingsState = {
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  preferredSessionMinutes: 60,
  hasAllEquipment: true,
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

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const timezones = ["America/New_York", "America/Los_Angeles"];

async function runTest() {
  type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
  
  const serverWrites: ProfilePatch[] = [];

  const updateProfileSettings = async (patch: ProfilePatch): Promise<Result> => {
    serverWrites.push(patch);
    await new Promise(resolve => setTimeout(resolve, 50));
    return { ok: true };
  };

  const actions: SettingsActions = {
    updateProfileSettings,
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
  };

  const { container } = render(
    <SettingsForm
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const findSessionButton = (minutes: number) => {
    const label = `${minutes}m`;
    const buttons = document.querySelectorAll('button[aria-pressed]');
    for (const button of Array.from(buttons)) {
      if (button.textContent === label) {
        return button as HTMLButtonElement;
      }
    }
    throw new Error(`Could not find button for ${label}`);
  };

  const user = userEvent.setup({ delay: null });

  // Triple-tap: 30m, 75m, 45m
  await act(async () => { await user.click(findSessionButton(30)); });
  await act(async () => { await user.click(findSessionButton(75)); });
  await act(async () => { await user.click(findSessionButton(45)); });

  // Wait for all saves to settle
  await new Promise(resolve => setTimeout(resolve, 300));

  // Check server final value
  const finalServerValue = serverWrites[serverWrites.length - 1]?.preferred_session_minutes;
  
  if (finalServerValue === 45) {
    console.log("  ✓ Server final value is 45m (last tap)");
    passed++;
  } else {
    console.error(`  ❌ Server final value is ${finalServerValue}m (expected 45m)`);
    failed++;
  }

  // Check that all toggles are enabled (not disabled)
  const toggles = container.querySelectorAll('button[role="switch"]');
  let allEnabled = true;
  
  for (const toggle of Array.from(toggles)) {
    const htmlToggle = toggle as HTMLButtonElement;
    if (htmlToggle.disabled) {
      allEnabled = false;
      const label = htmlToggle.querySelector('span span')?.textContent || 'unknown';
      console.error(`  ❌ Toggle "${label}" is disabled`);
    }
  }
  
  if (allEnabled && toggles.length === 6) {
    console.log(`  ✓ All ${toggles.length} toggles are enabled`);
    passed++;
  } else if (allEnabled) {
    console.error(`  ❌ Expected 6 toggles, found ${toggles.length}`);
    failed++;
  } else {
    console.error(`  ❌ Some toggles are disabled (expected all enabled)`);
    failed++;
  }

  // Check that Timezone picker (combobox) is enabled
  const timezonePicker = container.querySelector('[role="combobox"]') as HTMLSelectElement | null;
  
  if (!timezonePicker) {
    console.error("  ❌ Timezone picker not found");
    failed++;
  } else if (timezonePicker.disabled) {
    console.error("  ❌ Timezone picker is disabled (expected enabled)");
    failed++;
  } else {
    console.log("  ✓ Timezone picker is enabled");
    passed++;
  }

  cleanup();
}

runTest().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
