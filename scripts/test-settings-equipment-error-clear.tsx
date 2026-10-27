#!/usr/bin/env tsx
/**
 * Test 4: Equipment error then success clears the note.
 * 
 * An equipment error followed by a successful save clears the error note.
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

console.log("\n🧪 Test 4: Equipment error then success clears note\n");

const initialState: SettingsState = {
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  preferredSessionMinutes: 60,
  hasAllEquipment: false,
  equipmentIds: ["barbell"],
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
  { id: "dumbbell", name: "Dumbbell", category: "free_weight" },
];

const timezones = ["America/New_York"];

async function runTest() {
  type EquipmentPatch = Parameters<SettingsActions["updateEquipment"]>[0];
  
  let callCount = 0;
  let setEquipmentCallCount = 0;

  const updateEquipment = async (patch: EquipmentPatch): Promise<Result> => {
    callCount++;
    
    // First call fails
    if (callCount === 1) {
      return { ok: false, error: "Equipment save failed" };
    }
    
    // Second call succeeds
    return { ok: true };
  };

  // New atomic operation that the actual code uses
  const setEquipmentItem = async (): Promise<Result> => {
    setEquipmentCallCount++;
    
    // First call fails
    if (setEquipmentCallCount === 1) {
      return { ok: false, error: "Equipment save failed" };
    }
    
    // Second call succeeds
    return { ok: true };
  };

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment,
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem,
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

  const user = userEvent.setup({ delay: null });

  // Click dumbbell chip (will fail)
  const dumbbellChip = Array.from(container.querySelectorAll('button[aria-pressed]'))
    .find(b => b.textContent === "Dumbbell") as HTMLButtonElement | undefined;
  
  if (!dumbbellChip) {
    console.error("  ❌ Dumbbell chip not found");
    failed++;
    cleanup();
    return;
  }

  await act(async () => { await user.click(dumbbellChip); });

  // Wait for save to complete and UI to update
  await new Promise(resolve => setTimeout(resolve, 300));

  // Check that error is visible
  let statusDiv = container.querySelector('[role="status"]');
  let statusText = statusDiv?.textContent || "";
  
  if (statusText.includes("Equipment save failed")) {
    console.log("  ✓ Error message visible after failed equipment save");
    passed++;
  } else {
    console.error(`  ❌ Error not visible. Status: "${statusText}"`);
    failed++;
  }

  // Click dumbbell chip again to deselect it (will succeed)
  await act(async () => { await user.click(dumbbellChip); });

  // Wait for save to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check that error is cleared
  statusDiv = container.querySelector('[role="status"]');
  statusText = statusDiv?.textContent || "";
  
  if (!statusText.includes("Equipment save failed") && !statusText.includes("error")) {
    console.log("  ✓ Error cleared after successful equipment save");
    passed++;
  } else {
    console.error(`  ❌ Error still visible. Status: "${statusText}"`);
    failed++;
  }

  cleanup();
}

runTest().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
