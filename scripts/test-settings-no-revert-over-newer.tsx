#!/usr/bin/env tsx
/**
 * Test 3: Don't revert over a newer value.
 * 
 * Tap 30 (fails), then tap 45 (succeeds). Assert UI shows 45 and lastSaved is 45.
 * The failure of 30 should NOT revert to 60 because 45 is still pending.
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

console.log("\n🧪 Test 3: Don't revert over a newer value\n");

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

const timezones = ["America/New_York"];

async function runTest() {
  type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
  
  const serverWrites: ProfilePatch[] = [];

  const updateProfileSettings = async (patch: ProfilePatch): Promise<Result> => {
    const value = patch.preferred_session_minutes;
    serverWrites.push(patch);
    
    // 30 fails, 45 succeeds
    if (value === 30) {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { ok: false, error: "Network error" };
    }
    
    if (value === 45) {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { ok: true };
    }
    
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

  // Tap 30 (will fail)
  await act(async () => { await user.click(findSessionButton(30)); });
  
  // Tap 45 immediately (will succeed)
  await act(async () => { await user.click(findSessionButton(45)); });

  // Wait for both to settle
  await new Promise(resolve => setTimeout(resolve, 200));

  // Check that UI shows 45 (not reverted to 60)
  const sessionButtons = document.querySelectorAll('button[aria-pressed]');
  const session45Button = Array.from(sessionButtons).find(b => b.textContent === '45m') as HTMLButtonElement | undefined;
  const session60Button = Array.from(sessionButtons).find(b => b.textContent === '60m') as HTMLButtonElement | undefined;
  const session30Button = Array.from(sessionButtons).find(b => b.textContent === '30m') as HTMLButtonElement | undefined;
  
  if (session45Button?.getAttribute('aria-pressed') === 'true') {
    console.log("  ✓ UI shows 45m (newer value not reverted)");
    passed++;
  } else if (session60Button?.getAttribute('aria-pressed') === 'true') {
    console.error("  ❌ UI shows 60m (incorrectly reverted despite newer 45m pending)");
    failed++;
  } else if (session30Button?.getAttribute('aria-pressed') === 'true') {
    console.error("  ❌ UI shows 30m (failed value)");
    failed++;
  } else {
    console.error("  ❌ Could not determine session length state");
    failed++;
  }

  // Check that server received 45 as final value
  const finalServerValue = serverWrites[serverWrites.length - 1]?.preferred_session_minutes;
  
  if (finalServerValue === 45) {
    console.log("  ✓ Server final value is 45m");
    passed++;
  } else {
    console.error(`  ❌ Server final value is ${finalServerValue}m (expected 45m)`);
    failed++;
  }

  cleanup();
}

runTest().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
