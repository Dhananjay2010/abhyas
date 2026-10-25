#!/usr/bin/env tsx
/**
 * LOW 3: Multi-key patch failure must revert ALL keys
 * 
 * When a multi-key patch fails (e.g. days_per_week + yoga_days_per_week),
 * revert BOTH keys, not just the first.
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

// Test: Change days per week (multi-key patch with yoga), fail, assert both revert
async function testMultiKeyRevert() {
  console.log("\n📋 Test: Multi-key patch (days_per_week + yoga_days_per_week) fails -> both revert\n");
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => {
      const hasBothKeys = 'days_per_week' in patch && 'yoga_days_per_week' in patch;
      
      if (hasBothKeys) {
        await new Promise(r => setTimeout(r, 50));
        return { ok: false, error: "Multi-key save failed" };
      }
      
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

  // Find "Days per week" section and click "4"
  const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
  
  // Debug: log all button texts
  console.log("  All buttons:", buttons.map(b => b.textContent).join(", "));
  
  // Find the button more loosely - just find "4" buttons and pick the right one
  const button4Candidates = buttons.filter(b => b.textContent === "4");
  console.log(`  Found ${button4Candidates.length} buttons with text "4"`);
  
  // The first "4" should be days per week, second would be yoga days
  const button4Days = button4Candidates[0] as HTMLButtonElement | undefined;

  assert(!!button4Days, "Found '4' button in Days per week");

  // Initial state: 3 days, 0 yoga
  const button3Candidates = buttons.filter(b => b.textContent === "3");
  const button3Initial = button3Candidates[0] as HTMLButtonElement | undefined;
  
  assert(button3Initial?.getAttribute("aria-pressed") === "true", "Initial: 3 days selected");

  // Click 4 days (will set both days_per_week:4 and yoga_days_per_week:0, then fail)
  await act(async () => {
    button4Days!.click();
  });

  await new Promise(r => setTimeout(r, 200));

  // After failure, UI must revert to 3 days
  const buttonsAfter = Array.from(container.querySelectorAll('button[aria-pressed]'));
  const button3AfterCandidates = buttonsAfter.filter(b => b.textContent === "3");
  const button4AfterCandidates = buttonsAfter.filter(b => b.textContent === "4");
  
  const button3After = button3AfterCandidates[0] as HTMLButtonElement | undefined;
  const button4After = button4AfterCandidates[0] as HTMLButtonElement | undefined;

  assert(button3After?.getAttribute("aria-pressed") === "true", "After failure: 3 days selected (reverted)");
  assert(button4After?.getAttribute("aria-pressed") !== "true", "After failure: 4 days NOT selected");

  // Also check that yoga days is still at 0 (or constrained to max allowed)
  const yoga0Candidates = buttonsAfter.filter(b => b.textContent === "0");
  // Yoga "0" button should exist (there might be other "0" buttons too)
  const yoga0Button = yoga0Candidates.find(b => b.getAttribute("aria-pressed") === "true");
  assert(!!yoga0Button, "After failure: yoga days at 0 (reverted)");

  cleanup();
}

// Run test
(async () => {
  console.log("\n🧪 Settings multi-key revert test (LOW 3)\n");
  
  try {
    await testMultiKeyRevert();
    
    console.log(`\n✅ Test passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
