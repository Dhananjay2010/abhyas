#!/usr/bin/env tsx
/**
 * Test N1: Two fields fail, both revert, both errors shown with names.
 * 
 * Tests that failed saves:
 * 1. Revert the field to its last saved value (not unsaved value)
 * 2. Show friendly error with field name (never raw 'Failed to fetch')
 * 3. Show ALL failed fields, not just the first
 * 4. Leave no uncaught console errors or unhandled rejections
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

console.log("\n🧪 Test N1: Two fields fail, both revert, both errors shown\n");

const initialState: SettingsState = {
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
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
  let unhandledRejection = false;
  
  // Track unhandled rejections (N1 requirement)
  const rejectHandler = () => {
    unhandledRejection = true;
  };
  process.on('unhandledRejection', rejectHandler);

  const updateProfileSettings = async (patch: ProfilePatch): Promise<Result> => {
    serverWrites.push(patch);
    
    // Both fields fail with network error
    if ('preferred_session_minutes' in patch) {
      return { ok: false, error: "Failed to fetch" };
    }
    if ('days_per_week' in patch) {
      return { ok: false, error: "Network error" };
    }
    
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

  const user = userEvent.setup({ delay: null });

  // Click session length to change from 60m to 45m (will fail)
  const sessionButton = Array.from(container.querySelectorAll('button[aria-pressed]'))
    .find(b => b.textContent === '45m') as HTMLButtonElement | undefined;
  
  if (!sessionButton) {
    console.error("  ❌ 45m button not found");
    failed++;
    cleanup();
    process.off('unhandledRejection', rejectHandler);
    return;
  }

  await act(async () => { await user.click(sessionButton); });

  // Wait a bit for UI update
  await new Promise(resolve => setTimeout(resolve, 50));

  // Click days per week to change from 4 to 5 (will fail)
  // Find all aria-pressed buttons and look for just "5"
  const allButtons = Array.from(container.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
  const daysButton = allButtons.find(b => {
    const text = b.textContent?.trim();
    // Days per week buttons are just numbers 3, 4, 5, 6
    return text === '5' && !text.includes('m');
  });
  
  if (!daysButton) {
    console.error("  ❌ Days=5 button not found");
    console.error(`  Available button texts: ${allButtons.map(b => b.textContent).join(', ')}`);
    failed++;
    cleanup();
    process.off('unhandledRejection', rejectHandler);
    return;
  }

  await act(async () => { await user.click(daysButton); });

  // Wait for saves to fail
  await new Promise(resolve => setTimeout(resolve, 200));

  // Check that session length reverted to 60m (last saved)
  const sessionButtons = container.querySelectorAll('button[aria-pressed]');
  const session60Button = Array.from(sessionButtons).find(b => b.textContent === '60m') as HTMLButtonElement | undefined;
  const session45Button = Array.from(sessionButtons).find(b => b.textContent === '45m') as HTMLButtonElement | undefined;
  
  if (session60Button?.getAttribute('aria-pressed') === 'true') {
    console.log("  ✓ Session length reverted to 60m (last saved value)");
    passed++;
  } else if (session45Button?.getAttribute('aria-pressed') === 'true') {
    console.error("  ❌ Session length still shows 45m (unsaved value, should revert to 60m)");
    failed++;
  } else {
    console.error("  ❌ Could not determine session length state");
    failed++;
  }

  // Check that days per week reverted to 4 (last saved)
  const allButtonsAfter = Array.from(container.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
  const days4Button = allButtonsAfter.find(b => {
    const text = b.textContent?.trim();
    return text === '4' && !text.includes('m');
  });
  
  const days5Button = allButtonsAfter.find(b => {
    const text = b.textContent?.trim();
    return text === '5' && !text.includes('m');
  });
  
  if (days4Button?.getAttribute('aria-pressed') === 'true') {
    console.log("  ✓ Days per week reverted to 4 (last saved value)");
    passed++;
  } else if (days5Button?.getAttribute('aria-pressed') === 'true') {
    console.error("  ❌ Days per week still shows 5 (unsaved value, should revert to 4)");
    failed++;
  } else {
    console.error("  ❌ Could not determine days per week state");
    failed++;
  }

  // Check that BOTH errors are visible with field names
  const statusDiv = container.querySelector('[role="status"]');
  const statusText = statusDiv?.textContent || "";
  
  const hasSessionError = statusText.includes("Session length") || statusText.includes("session length");
  const hasDaysError = statusText.includes("Days per week") || statusText.includes("days per week");
  
  if (hasSessionError) {
    console.log("  ✓ Session length error is shown with field name");
    passed++;
  } else {
    console.error(`  ❌ Session length error not shown with field name. Status: "${statusText}"`);
    failed++;
  }
  
  if (hasDaysError) {
    console.log("  ✓ Days per week error is shown with field name");
    passed++;
  } else {
    console.error(`  ❌ Days per week error not shown with field name. Status: "${statusText}"`);
    failed++;
  }

  // Check that raw "Failed to fetch" text is NOT shown
  if (!statusText.includes("Failed to fetch")) {
    console.log("  ✓ No raw 'Failed to fetch' text shown");
    passed++;
  } else {
    console.error(`  ❌ Raw 'Failed to fetch' text is visible: "${statusText}"`);
    failed++;
  }

  // Check for unhandled rejections
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (!unhandledRejection) {
    console.log("  ✓ No unhandled promise rejections");
    passed++;
  } else {
    console.error("  ❌ Unhandled promise rejection detected");
    failed++;
  }

  process.off('unhandledRejection', rejectHandler);
  cleanup();
}

runTest().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
