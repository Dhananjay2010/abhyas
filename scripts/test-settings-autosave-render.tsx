#!/usr/bin/env tsx
/**
 * Test SettingsForm autosave with out-of-order responses.
 * 
 * Renders SettingsForm with controlled action spies, clicks days per week 4,5,3,4 quickly,
 * resolves responses out of order, and asserts final state is 4 with "Saved" status.
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsActions, type SettingsState } from "../src/app/settings/settings-form";
import type { Result } from "../src/app/settings/actions";

let passed = 0;
let failed = 0;
let timeoutId: NodeJS.Timeout | null = null;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function test(name: string, fn: () => Promise<void>, timeoutMs = 10000) {
  console.log(`\n▶ ${name}`);
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    failed++;
    console.error(`❌ ${name}: ${err}`);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    cleanup();
  }
}

console.log("\n🧪 Testing SettingsForm autosave with out-of-order responses\n");

// Initial state for the form
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
};

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
  { id: "dumbbell", name: "Dumbbell", category: "free_weight" },
];

const timezones = ["America/New_York", "America/Los_Angeles", "Europe/London"];

async function runTests() {
  // Test 1: Quick clicks 4,5,3,4 with out-of-order responses
  await test("Days per week: 4→5→3→4 with out-of-order responses", async () => {
    type Resolver = (result: Result) => void;
    const pendingCalls: Array<{ patch: any; resolve: Resolver }> = [];
    
    // Spy that captures calls and returns controllable promises
    const updateProfileSettings = (patch: any): Promise<Result> => {
      return new Promise<Result>((resolve) => {
        pendingCalls.push({ patch, resolve });
      });
    };
    
    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };
    
    const { getByLabelText, getByRole } = render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
    
    // Find the segmented control for "Days per week"
    // The Segmented control uses buttons with text labels "3", "4", "5", "6"
    const findDayButton = (day: number) => {
      const buttons = document.querySelectorAll('button[aria-pressed]');
      for (const button of Array.from(buttons)) {
        if (button.textContent === String(day)) {
          return button as HTMLButtonElement;
        }
      }
      throw new Error(`Could not find button for day ${day}`);
    };
    
    const days3Button = findDayButton(3);
    const days4Button = findDayButton(4);
    const days5Button = findDayButton(5);
    const days6Button = findDayButton(6);
    
    // Find autosave status
    const statusElement = getByRole("status");
    
    assert(statusElement !== null, "Autosave status element should exist");
    
    // Click 4, 5, 3, 4 quickly
    const user = userEvent.setup({ delay: null });
    
    await act(async () => {
      await user.click(days4Button);
    });
    
    await act(async () => {
      await user.click(days5Button);
    });
    
    await act(async () => {
      await user.click(days3Button);
    });
    
    await act(async () => {
      await user.click(days4Button);
    });
    
    // All 4 requests should be pending
    assert(pendingCalls.length === 4, `Should have 4 pending calls, got ${pendingCalls.length}`);
    
    // Verify the sequence: 4, 5, 3, 4
    assert(pendingCalls[0].patch.days_per_week === 4, "First call should be for 4");
    assert(pendingCalls[1].patch.days_per_week === 5, "Second call should be for 5");
    assert(pendingCalls[2].patch.days_per_week === 3, "Third call should be for 3");
    assert(pendingCalls[3].patch.days_per_week === 4, "Fourth call should be for 4");
    
    // Status should show "Saving…"
    await waitFor(() => {
      assert(
        statusElement.textContent?.includes("Saving") ?? false,
        `Status should show "Saving…", got "${statusElement.textContent}"`
      );
    });
    
    // Resolve responses OUT OF ORDER: 5, 4(first), 3, 4(last)
    // Response for 5 arrives first
    await act(async () => {
      pendingCalls[1].resolve({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    
    // Response for 4 (first) arrives second (should be ignored)
    await act(async () => {
      pendingCalls[0].resolve({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    
    // Response for 3 arrives third
    await act(async () => {
      pendingCalls[2].resolve({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    
    // Response for 4 (last) arrives fourth - this should set final state
    await act(async () => {
      pendingCalls[3].resolve({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    
    // Final state should be 4
    await waitFor(() => {
      const button4 = findDayButton(4);
      assert(
        button4.getAttribute("aria-pressed") === "true",
        "Days per week 4 should be selected"
      );
    });
    
    // Status should show "Saved"
    await waitFor(() => {
      assert(
        statusElement.textContent?.includes("Saved") ?? false,
        `Status should show "Saved", got "${statusElement.textContent}"`
      );
    });
    
    console.log("  ✓ Final state is 4");
    console.log("  ✓ Status reads 'Saved'");
  }, 15000);
  
  // Test 2: Rapid session length changes 30→75→45→60
  await test("Session length: 30→75→45→60 with out-of-order responses", async () => {
    type Resolver = (result: Result) => void;
    const pendingCalls: Array<{ patch: any; resolve: Resolver }> = [];
    
    const updateProfileSettings = (patch: any): Promise<Result> => {
      return new Promise<Result>((resolve) => {
        pendingCalls.push({ patch, resolve });
      });
    };
    
    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };
    
    const { getByLabelText, getByRole } = render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
    
    const status = getByRole("status");
    const user = userEvent.setup({ delay: null });
    
    // Helper to find session length buttons
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
    
    // Click 30m, 75m, 45m, 60m quickly
    await act(async () => {
      await user.click(findSessionButton(30));
    });
    
    await act(async () => {
      await user.click(findSessionButton(75));
    });
    
    await act(async () => {
      await user.click(findSessionButton(45));
    });
    
    await act(async () => {
      await user.click(findSessionButton(60));
    });
    
    assert(pendingCalls.length === 4, `Should have 4 pending calls, got ${pendingCalls.length}`);
    assert(pendingCalls[0].patch.preferred_session_minutes === 30, "First call should be for 30");
    assert(pendingCalls[1].patch.preferred_session_minutes === 75, "Second call should be for 75");
    assert(pendingCalls[2].patch.preferred_session_minutes === 45, "Third call should be for 45");
    assert(pendingCalls[3].patch.preferred_session_minutes === 60, "Fourth call should be for 60");
    
    // Resolve out of order: 75, 30, 45, 60
    await act(async () => {
      pendingCalls[1].resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 50));
    });
    
    await act(async () => {
      pendingCalls[0].resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 50));
    });
    
    await act(async () => {
      pendingCalls[2].resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 50));
    });
    
    await act(async () => {
      pendingCalls[3].resolve({ ok: true });
      await new Promise((r) => setTimeout(r, 100));
    });
    
    // Final state should be 60
    await waitFor(() => {
      const button60 = findSessionButton(60);
      assert(
        button60.getAttribute("aria-pressed") === "true",
        "Session length 60m should be selected"
      );
    });
    
    await waitFor(() => {
      assert(
        status.textContent?.includes("Saved") ?? false,
        "Status should show 'Saved'"
      );
    });
    
    console.log("  ✓ Final state is 60");
    console.log("  ✓ Status reads 'Saved'");
  }, 15000);
  
  // Test 3: Error handling with retry
  await test("Error handling: shows error with retry button", async () => {
    let attemptCount = 0;
    
    const updateProfileSettings = async (): Promise<Result> => {
      attemptCount++;
      if (attemptCount === 1) {
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
    
    const { getByLabelText, getByRole, getByText } = render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );
    
    const status = getByRole("status");
    const user = userEvent.setup({ delay: null });
    
    // Helper to find day button
    const findDayButton = (day: number) => {
      const buttons = document.querySelectorAll('button[aria-pressed]');
      for (const button of Array.from(buttons)) {
        if (button.textContent === String(day)) {
          return button as HTMLButtonElement;
        }
      }
      throw new Error(`Could not find button for day ${day}`);
    };
    
    // Click days 4
    await act(async () => {
      await user.click(findDayButton(4));
    });
    
    // Wait for error to appear
    await waitFor(() => {
      assert(
        status.textContent?.includes("Network error") ?? false,
        "Status should show error message"
      );
    });
    
    // Should have a retry button
    const retryButton = getByText("Retry");
    assert(retryButton !== null, "Retry button should exist");
    
    // Click retry
    await act(async () => {
      await user.click(retryButton);
    });
    
    // Should eventually succeed
    await waitFor(() => {
      assert(
        status.textContent?.includes("Saved") ?? false,
        "Status should show 'Saved' after retry"
      );
    });
    
    assert(attemptCount === 2, `Should have attempted twice, got ${attemptCount}`);
    
    console.log("  ✓ Error shown with retry button");
    console.log("  ✓ Retry succeeds");
  }, 15000);
}

runTests().then(() => {
  console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
