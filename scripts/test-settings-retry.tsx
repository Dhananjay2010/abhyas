#!/usr/bin/env tsx
/**
 * Test 3: Failed save followed by Retry.
 * 
 * A failed save followed by Retry calls the action again with the failed value
 * and clears the error once it succeeds.
 * 
 * This test MUST FAIL on main before the fix (Retry button has empty onClick).
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

console.log("\n🧪 Test 3: Failed save + Retry clears error\n");

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
  units: 'metric',
};

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const timezones = ["America/New_York"];

async function runTest() {
  type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
  
  let callCount = 0;
  const serverWrites: ProfilePatch[] = [];

  const updateProfileSettings = async (patch: ProfilePatch): Promise<Result> => {
    serverWrites.push(patch);
    callCount++;
    
    // M1 fix: First call returns {ok:false} (not throw)
    if (callCount === 1) {
      return { ok: false, error: "Network error" };
    }
    
    // Retry succeeds
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

  // Click session length to change from 60m to 45m (will fail with {ok:false})
  await act(async () => { await user.click(findSessionButton(45)); });

  // Wait for save to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check that error is visible
  let statusDiv = container.querySelector('[role="status"]');
  let statusText = statusDiv?.textContent || "";
  
  if (statusText.includes("Network error") || statusText.includes("Session length")) {
    console.log("  ✓ Error message visible after failed save");
    passed++;
  } else {
    console.error(`  ❌ Error not visible. Status: "${statusText}"`);
    failed++;
  }
  
  // Check that session length reverted to 60m
  const sessionButtons = document.querySelectorAll('button[aria-pressed]');
  const session60Button = Array.from(sessionButtons).find(b => b.textContent === '60m') as HTMLButtonElement | undefined;
  const session45Button = Array.from(sessionButtons).find(b => b.textContent === '45m') as HTMLButtonElement | undefined;
  
  if (session60Button?.getAttribute('aria-pressed') === 'true') {
    console.log("  ✓ Session length reverted to 60m after failed save");
    passed++;
  } else if (session45Button?.getAttribute('aria-pressed') === 'true') {
    console.error("  ❌ Session length still shows 45m (should revert to 60m)");
    failed++;
  } else {
    console.error("  ❌ Could not determine session length state");
    failed++;
  }

  // Find and click Retry button
  const retryButton = Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent?.includes("Retry")) as HTMLButtonElement | undefined;
  
  if (!retryButton) {
    console.error("  ❌ Retry button not found");
    failed++;
  } else {
    console.log("  ✓ Retry button found");
    passed++;
    
    // Click Retry
    await act(async () => { await user.click(retryButton); });
    
    // Wait for retry to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that error is cleared
    statusDiv = container.querySelector('[role="status"]');
    statusText = statusDiv?.textContent || "";
    
    if (!statusText.includes("Network error") && !statusText.includes("error")) {
      console.log("  ✓ Error cleared after successful retry");
      passed++;
    } else {
      console.error(`  ❌ Error still visible after retry. Status: "${statusText}"`);
      failed++;
    }
    
    // Check that action was called twice (original + retry)
    if (callCount === 2) {
      console.log("  ✓ Action called twice (original + retry)");
      passed++;
    } else {
      console.error(`  ❌ Action called ${callCount} times (expected 2)`);
      failed++;
    }
    
    // M1 fix #2: Check that UI shows 45m (the retried value) and was sent to server
    const finalServerValue = serverWrites[serverWrites.length - 1]?.preferred_session_minutes;
    const session45AfterRetry = Array.from(document.querySelectorAll('button[aria-pressed]'))
      .find(b => b.textContent === '45m') as HTMLButtonElement | undefined;
    
    if (session45AfterRetry?.getAttribute('aria-pressed') === 'true') {
      console.log("  ✓ UI shows 45m after successful retry");
      passed++;
    } else {
      console.error("  ❌ UI should show 45m after successful retry");
      failed++;
    }
    
    if (finalServerValue === 45) {
      console.log("  ✓ Server received 45m on retry");
      passed++;
    } else {
      console.error(`  ❌ Server received ${finalServerValue}m (expected 45m)`);
      failed++;
    }
  }

  cleanup();
}

runTest().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
