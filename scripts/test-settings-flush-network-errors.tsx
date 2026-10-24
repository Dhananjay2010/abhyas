#!/usr/bin/env tsx
/**
 * Test Settings flush on unmount/unload and network error handling.
 * 
 * Three QA findings:
 * 1. MEDIUM: Lost change on leave - verify queue flushes on unmount/pagehide/visibilitychange
 * 2. LOW-B: Network failure - inline error, value revert, no offline screen
 * 3. Two tabs - refresh on visibilitychange to visible when no pending saves
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act, waitFor } from "@testing-library/react";
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

console.log("\n🧪 Testing Settings flush and network error handling\n");

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
  dateOfBirth: "1990-01-15",
};

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const timezones = ["America/New_York"];

async function runTests() {
  // Test 1a: Change value, immediately unmount -> save was called
  await test("QA#1a: Change value then unmount -> save is called with new value", async () => {
    let dobSaveCalled = false;
    let savedDob: string | null = null;

    const updateProfileSettings = async (patch: Parameters<SettingsActions["updateProfileSettings"]>[0]): Promise<Result> => {
      if (patch.date_of_birth !== undefined) {
        dobSaveCalled = true;
        savedDob = patch.date_of_birth;
      }
      // Simulate slow network
      await new Promise(resolve => setTimeout(resolve, 100));
      return { ok: true };
    };

    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    const { unmount } = render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );

    // Find DOB input and change it
    const dobInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    assert(dobInput !== null, "DOB input exists");
    
    if (dobInput) {
      await act(async () => {
        dobInput.value = "1995-06-20";
        dobInput.dispatchEvent(new Event("change", { bubbles: true }));
        dobInput.dispatchEvent(new Event("blur", { bubbles: true }));
      });

      // Immediately unmount (simulating navigation)
      await act(async () => {
        unmount();
      });

      // Wait briefly for any async operations
      await new Promise(resolve => setTimeout(resolve, 150));

      assert(dobSaveCalled, "DOB save was called on unmount");
      assert(savedDob === "1995-06-20", `Saved value is correct (got ${savedDob})`);
    }
  });

  // Test 1b: Change value, fire pagehide -> save was called
  await test("QA#1b: Change value then pagehide -> save is called", async () => {
    let sessionSaveCalled = false;
    let savedMinutes: number | null = null;

    const updateProfileSettings = async (patch: Parameters<SettingsActions["updateProfileSettings"]>[0]): Promise<Result> => {
      if (patch.preferred_session_minutes !== undefined) {
        sessionSaveCalled = true;
        savedMinutes = patch.preferred_session_minutes;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      return { ok: true };
    };

    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );

    const user = userEvent.setup({ delay: null });

    // Find and click 45m session length button
    const button45m = Array.from(document.querySelectorAll('button[aria-pressed]'))
      .find(b => b.textContent === '45m') as HTMLButtonElement;
    
    assert(button45m !== null, "45m button exists");

    if (button45m) {
      await act(async () => {
        await user.click(button45m);
      });

      // Fire pagehide immediately
      await act(async () => {
        window.dispatchEvent(new Event("pagehide"));
      });

      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 150));

      assert(sessionSaveCalled, "Session length save was called on pagehide");
      assert(savedMinutes === 45, `Saved value is 45 (got ${savedMinutes})`);
    }
  });

  // Test 2a: Network failure on DOB -> inline error, value reverts, no offline screen
  await test("QA#2a: Network failure on DOB -> inline error, value reverts, page stays mounted", async () => {
    const updateProfileSettings = async (patch: Parameters<SettingsActions["updateProfileSettings"]>[0]): Promise<Result> => {
      if (patch.date_of_birth !== undefined) {
        // Simulate network failure
        throw new Error("Network request failed");
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

    const dobInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    assert(dobInput !== null, "DOB input exists");

    if (dobInput) {
      // Change DOB
      await act(async () => {
        dobInput.value = "1995-06-20";
        dobInput.dispatchEvent(new Event("change", { bubbles: true }));
        dobInput.dispatchEvent(new Event("blur", { bubbles: true }));
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that error is shown inline (not an offline screen)
      const statusDiv = container.querySelector('[role="status"]');
      assert(statusDiv !== null, "Status div exists (page stayed mounted, no offline screen)");

      if (statusDiv) {
        const errorText = statusDiv.textContent || "";
        assert(errorText.includes("Network") || errorText.includes("failed"), `Error message visible: "${errorText}"`);
      }

      // Check that value reverted to initial
      assert(dobInput.value === "1990-01-15", `DOB reverted to initial value (got ${dobInput.value})`);

      // Verify NO offline screen appeared
      const offlineScreen = container.querySelector('h1:contains("offline"), h1:contains("Retry")');
      assert(offlineScreen === null, "No full-page offline screen appeared");
    }
  });

  // Test 2b: Network failure on session setting -> inline error, value reverts
  await test("QA#2b: Network failure on rest timer toggle -> inline error, value reverts", async () => {
    const updateSessionSettings = async (patch: Parameters<SettingsActions["updateSessionSettings"]>[0]): Promise<Result> => {
      if (patch.rest_timer_sound !== undefined) {
        throw new Error("Failed to fetch");
      }
      return { ok: true };
    };

    const actions: SettingsActions = {
      updateProfileSettings: async () => ({ ok: true }),
      updateSessionSettings,
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    const { container } = render(
      <SettingsForm
        initial={{ ...initialState, restSound: true }}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );

    // Find rest sound toggle
    const toggles = Array.from(container.querySelectorAll('button[role="switch"]'));
    const restSoundToggle = toggles.find(t => t.textContent?.includes("Sound when rest ends")) as HTMLButtonElement;
    
    assert(restSoundToggle !== null, "Rest sound toggle exists");

    if (restSoundToggle) {
      const user = userEvent.setup({ delay: null });

      await act(async () => {
        await user.click(restSoundToggle);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Error should be shown
      const statusDiv = container.querySelector('[role="status"]');
      if (statusDiv) {
        const errorText = statusDiv.textContent || "";
        assert(errorText.includes("failed") || errorText.includes("error"), `Error visible: "${errorText}"`);
      }

      // Toggle should revert to original state (true/checked)
      const ariaChecked = restSoundToggle.getAttribute('aria-checked');
      assert(ariaChecked === 'true', `Toggle reverted to original state (got ${ariaChecked})`);
    }
  });

  // Test 3a: visibilitychange to visible with no pending saves -> refresh triggered
  await test("QA#3a: Tab becomes visible with no pending saves -> data refreshed", async () => {
    let refreshCalled = false;

    const updateProfileSettings = async (): Promise<Result> => {
      return { ok: true };
    };

    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );

    // Mock router.refresh by checking if it was called
    // In the actual implementation, we'll need to inject this or use a spy

    // Simulate tab becoming visible
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // TODO: Assert that router.refresh() or refetch was called
    // This will require mocking useRouter or providing a refresh callback
    console.log("  ⚠ Refresh check requires router mock (to be implemented)");
  });

  // Test 3b: visibilitychange to visible WITH pending saves -> no refresh
  await test("QA#3b: Tab becomes visible with pending saves -> no refresh", async () => {
    let slowSaveResolve: ((result: Result) => void) | null = null;

    const updateProfileSettings = async (patch: Parameters<SettingsActions["updateProfileSettings"]>[0]): Promise<Result> => {
      if (patch.preferred_session_minutes !== undefined) {
        // Hold the save indefinitely
        return new Promise(resolve => {
          slowSaveResolve = resolve;
        });
      }
      return { ok: true };
    };

    const actions: SettingsActions = {
      updateProfileSettings,
      updateSessionSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
        actions={actions}
      />
    );

    const user = userEvent.setup({ delay: null });

    // Click 45m to start a pending save
    const button45m = Array.from(document.querySelectorAll('button[aria-pressed]'))
      .find(b => b.textContent === '45m') as HTMLButtonElement;
    
    if (button45m) {
      await act(async () => {
        await user.click(button45m);
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Now simulate visibility change while save is pending
      await act(async () => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // TODO: Assert that router.refresh() was NOT called
      console.log("  ⚠ Refresh check requires router mock (to be implemented)");

      // Clean up: resolve the pending save
      if (slowSaveResolve) {
        await act(async () => {
          slowSaveResolve!({ ok: true });
        });
      }
    }
  });
}

runTests().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
