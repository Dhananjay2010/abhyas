#!/usr/bin/env tsx
/**
 * Test 1: Triple-tap session length and verify toggles stay enabled.
 * 
 * H1: Realistic test with 400ms save latency and 150ms gaps between taps.
 * Tap session length 3 times (30m, 75m, 45m) with 150ms gaps.
 * Assert that after saves settle, ALL toggles (including Weigh-in reminder)
 * and the Timezone picker are ENABLED, and server's final value is 45m.
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
    // Realistic 400ms save latency
    await new Promise(resolve => setTimeout(resolve, 400));
    return { ok: true };
  };

  const actions: SettingsActions = {
    updateProfileSettings,
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
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

  // Triple-tap with 150ms gaps: 30m, 75m, 45m
  await act(async () => { await user.click(findSessionButton(30)); });
  await new Promise(resolve => setTimeout(resolve, 150));
  
  await act(async () => { await user.click(findSessionButton(75)); });
  await new Promise(resolve => setTimeout(resolve, 150));
  
  await act(async () => { await user.click(findSessionButton(45)); });

  // Wait for all saves to settle (400ms * 3 saves + margin)
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Check server final value
  const finalServerValue = serverWrites[serverWrites.length - 1]?.preferred_session_minutes;
  
  if (finalServerValue === 45) {
    console.log("  ✓ Server final value is 45m (last tap)");
    passed++;
  } else {
    console.error(`  ❌ Server final value is ${finalServerValue}m (expected 45m)`);
    failed++;
  }

  // Check that ALL toggles are enabled (6 session toggles)
  const toggles = container.querySelectorAll('button[role="switch"]');
  let allTogglesEnabled = true;
  const disabledToggles: string[] = [];
  
  for (const toggle of Array.from(toggles)) {
    const htmlToggle = toggle as HTMLButtonElement;
    if (htmlToggle.disabled) {
      allTogglesEnabled = false;
      const label = htmlToggle.querySelector('span span')?.textContent || 'unknown';
      disabledToggles.push(label);
    }
  }
  
  if (allTogglesEnabled && toggles.length === 6) {
    console.log(`  ✓ All ${toggles.length} toggles are enabled`);
    passed++;
  } else if (allTogglesEnabled) {
    console.error(`  ❌ Expected 6 toggles, found ${toggles.length}`);
    failed++;
  } else {
    console.error(`  ❌ Some toggles are disabled: ${disabledToggles.join(', ')}`);
    failed++;
  }
  
  // Check that Weigh-in reminder Segmented buttons are enabled
  const weighInButtons = Array.from(container.querySelectorAll('button[aria-pressed]'))
    .filter(b => ['Daily', 'Weekly', 'Never'].includes(b.textContent || '')) as HTMLButtonElement[];
  
  const allWeighInEnabled = weighInButtons.every(b => !b.disabled);
  
  if (allWeighInEnabled && weighInButtons.length === 3) {
    console.log(`  ✓ Weigh-in reminder buttons (Daily/Weekly/Never) are enabled`);
    passed++;
  } else if (!allWeighInEnabled) {
    console.error(`  ❌ Some Weigh-in reminder buttons are disabled`);
    failed++;
  } else {
    console.error(`  ❌ Expected 3 Weigh-in reminder buttons, found ${weighInButtons.length}`);
    failed++;
  }

  // Check that Timezone picker (input with datalist) is enabled
  const timezonePicker = container.querySelector('input[list="timezone-options"]') as HTMLInputElement | null;
  
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
