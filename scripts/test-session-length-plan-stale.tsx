#!/usr/bin/env tsx
/**
 * Test that changing session length marks the plan as stale.
 * 
 * MUST FAIL ON MAIN: main's settings-form.tsx doesn't pass affectsPlan=true
 * for session length saves, so the plan-stale prompt never appears.
 * 
 *   npm run test:session-length-plan-stale
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n▶ ${name}`);
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error(`❌ ${name}: ${err}`);
  } finally {
    cleanup();
  }
}

console.log("\n🧪 Testing session length marks plan as stale\n");

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
  dateOfBirth: "1990-01-01",
};

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const timezones = ["America/New_York"];

async function runTests() {
  await test("Session length change shows plan-stale prompt", async () => {
    let planStale = false;
    
    const updateProfileSettings = async (patch: Parameters<SettingsActions["updateProfileSettings"]>[0]): Promise<Result> => {
      // Check if this is a session length update
      if ('preferred_session_minutes' in patch) {
        // In the fixed version, this marks the plan as stale
        planStale = true;
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

    // Find and click a different session length button
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

    // Click 45m (different from initial 60m)
    await act(async () => {
      await user.click(findSessionButton(45));
    });

    // Wait for save to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that plan is marked as stale
    if (planStale) {
      console.log("  ✓ Plan marked as stale after session length change");
      passed++;
    } else {
      console.error("  ❌ Plan NOT marked as stale (bug in main)");
      failed++;
    }

    // Check for rebuild prompt in the UI
    const rebuil= container.textContent?.includes("Rebuild") || container.textContent?.includes("rebuild");
    const stale = container.textContent?.includes("stale") || container.textContent?.includes("Stale");
    
    if (rebuil|| stale) {
      console.log("  ✓ Rebuild/stale prompt visible in UI");
      passed++;
    } else {
      console.error("  ❌ Rebuild/stale prompt NOT visible (expected on main)");
      console.error(`     Container text: ${container.textContent?.substring(0, 200)}...`);
      failed++;
    }
  });
}

runTests().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
