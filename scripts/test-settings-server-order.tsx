#!/usr/bin/env tsx
/**
 * Test SettingsForm with spy server that records writes in arrival order.
 * 
 * Proves the QA bug: with concurrent saves and out-of-order resolution,
 * the server's final value can be wrong even if the UI looks correct.
 * 
 * This test MUST fail on main's settings-form.tsx for the right reason:
 * server receives writes in wrong order (e.g., 4→5→3 when user clicked 4→5→3→4).
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

console.log("\n🧪 Testing SettingsForm with spy server (arrival order)\n");

// Initial state
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
  units: "metric",
};

const equipment = [
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const timezones = ["America/New_York"];

async function runTests() {
  // Test: Days per week 4→5→3→4 with responses resolving out of order
  await test("QA Bug: days per week 4→5→3→4, server gets 3 instead of 4", async () => {
    type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
    type Resolver = (result: Result) => void;
    
    // Spy server: records writes in ARRIVAL order
    const serverWrites: ProfilePatch[] = [];
    const pendingRequests: Array<{ patch: ProfilePatch; resolve: Resolver }> = [];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const updateProfileSettings = (patch: ProfilePatch): Promise<Result> => {
      // Record arrival on server
      serverWrites.push(patch);
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      
      return new Promise<Result>((resolve) => {
        pendingRequests.push({ patch, resolve });
      });
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

    // Helper to find day buttons
    const findDayButton = (day: number) => {
      const buttons = document.querySelectorAll('button[aria-pressed]');
      for (const button of Array.from(buttons)) {
        if (button.textContent === String(day)) {
          return button as HTMLButtonElement;
        }
      }
      throw new Error(`Could not find button for day ${day}`);
    };

    const user = userEvent.setup({ delay: null });

    // Click 4, 5, 3, 4 rapidly
    await act(async () => {
      await user.click(findDayButton(4));
    });

    await act(async () => {
      await user.click(findDayButton(5));
    });

    await act(async () => {
      await user.click(findDayButton(3));
    });

    await act(async () => {
      await user.click(findDayButton(4));
    });

    // Wait for all requests to arrive at server
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`  Server received ${serverWrites.length} writes in arrival order:`);
    serverWrites.forEach((w, i) => {
      console.log(`    [${i}] days_per_week=${w.days_per_week}`);
    });

    console.log(`  Max concurrent in-flight requests: ${maxConcurrent}`);

    // Resolve responses OUT OF ORDER: 5, 4a, 3, 4b
    // (simulating different server processing times)
    await act(async () => {
      // Resolve request for 5 first
      const idx5 = serverWrites.findIndex(w => w.days_per_week === 5);
      if (idx5 >= 0 && pendingRequests[idx5]) {
        pendingRequests[idx5].resolve({ ok: true });
        currentConcurrent--;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      // Resolve first request for 4
      const idx4a = serverWrites.findIndex(w => w.days_per_week === 4);
      if (idx4a >= 0 && pendingRequests[idx4a]) {
        pendingRequests[idx4a].resolve({ ok: true });
        currentConcurrent--;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      // Resolve request for 3
      const idx3 = serverWrites.findIndex(w => w.days_per_week === 3);
      if (idx3 >= 0 && pendingRequests[idx3]) {
        pendingRequests[idx3].resolve({ ok: true });
        currentConcurrent--;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      // Resolve second request for 4 (the final one)
      const idx4b = serverWrites.findLastIndex(w => w.days_per_week === 4);
      if (idx4b >= 0 && pendingRequests[idx4b]) {
        pendingRequests[idx4b].resolve({ ok: true });
        currentConcurrent--;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Check final server state
    const finalServerValue = serverWrites[serverWrites.length - 1]?.days_per_week;
    
    console.log(`\n  Final server value: ${finalServerValue} (user clicked 4 last)`);
    console.log(`  Expected: 4`);
    console.log(`  Max concurrent per key: ${maxConcurrent > 1 ? `${maxConcurrent} (NOT SERIALIZED)` : "1 (serialized)"}`);

    // THE QA BUG: Server should have 4, but without serialization it has the last ARRIVAL, not last CLICK
    if (finalServerValue === 4) {
      console.log("  ✓ Server has correct final value (4)");
      passed++;
    } else {
      console.error(`  ❌ QA BUG REPRODUCED: Server has ${finalServerValue} instead of 4`);
      console.error(`     This happens because saves fire concurrently and server applies them in arrival order.`);
      failed++;
    }

    // Check serialization
    if (maxConcurrent === 1) {
      console.log("  ✓ At most 1 concurrent request per key (serialized)");
      passed++;
    } else {
      console.error(`  ❌ Max concurrent=${maxConcurrent} (saves fired concurrently, not serialized)`);
      failed++;
    }
  });

  // Test: Session length 30→75→45→60 out of order
  await test("Session length 30→75→45→60, max 1 concurrent", async () => {
    type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
    type Resolver = (result: Result) => void;
    
    const serverWrites: ProfilePatch[] = [];
    const pendingRequests: Array<{ patch: ProfilePatch; resolve: Resolver }> = [];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const updateProfileSettings = (patch: ProfilePatch): Promise<Result> => {
      serverWrites.push(patch);
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      
      return new Promise<Result>((resolve) => {
        pendingRequests.push({ patch, resolve });
      });
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

    // Click 30m, 75m, 45m, 60m
    await act(async () => { await user.click(findSessionButton(30)); });
    await act(async () => { await user.click(findSessionButton(75)); });
    await act(async () => { await user.click(findSessionButton(45)); });
    await act(async () => { await user.click(findSessionButton(60)); });

    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`  Server received ${serverWrites.length} writes`);
    console.log(`  Max concurrent: ${maxConcurrent}`);

    // Resolve out of order
    for (let i = serverWrites.length - 1; i >= 0; i--) {
      await act(async () => {
        if (pendingRequests[i]) {
          pendingRequests[i].resolve({ ok: true });
          currentConcurrent--;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    }

    const finalValue = serverWrites[serverWrites.length - 1]?.preferred_session_minutes;
    
    if (finalValue === 60) {
      console.log(`  ✓ Server final value is 60`);
      passed++;
    } else {
      console.error(`  ❌ Server final value is ${finalValue} (expected 60)`);
      failed++;
    }

    if (maxConcurrent === 1) {
      console.log(`  ✓ Max 1 concurrent per key`);
      passed++;
    } else {
      console.error(`  ❌ Max concurrent=${maxConcurrent}`);
      failed++;
    }
  });

  // Test 3: Cross-field error (days fails, session succeeds, error stays visible with Retry)
  await test("Cross-field error: days fails, session succeeds, error + Retry visible", async () => {
    type ProfilePatch = Parameters<SettingsActions["updateProfileSettings"]>[0];
    
    let daysRejected = false;
    let sessionSucceeded = false;

    const updateProfileSettings = async (patch: ProfilePatch): Promise<Result> => {
      if ('days_per_week' in patch) {
        // Days fails
        daysRejected = true;
        return { ok: false, error: "Days save failed" };
      } else if ('preferred_session_minutes' in patch) {
        // Session succeeds
        sessionSucceeded = true;
        return { ok: true };
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
      <SettingsForm initial={initialState} equipment={equipment} timezones={timezones} actions={actions} />
    );

    const user = userEvent.setup({ delay: null });

    // Click days per week (should fail)
    const daysButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === '5');
    
    if (daysButton) {
      await act(async () => { await user.click(daysButton); });
    }

    // Click session length (should succeed)
    const sessionButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === '60m');
    
    if (sessionButton) {
      await act(async () => { await user.click(sessionButton); });
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify both actions occurred
    if (daysRejected) {
      console.log(`  ✓ Days per week save rejected as expected`);
      passed++;
    } else {
      console.error(`  ❌ Days per week save did not reject`);
      failed++;
    }

    if (sessionSucceeded) {
      console.log(`  ✓ Session length save succeeded`);
      passed++;
    } else {
      console.error(`  ❌ Session length save did not succeed`);
      failed++;
    }

    // Check that error is visible
    const statusDiv = container.querySelector('[role="status"]');
    const errorText = statusDiv?.textContent || "";
    
    if (errorText.includes("Days save failed")) {
      console.log(`  ✓ Error message visible in status`);
      passed++;
    } else {
      console.error(`  ❌ Error not visible. Status text: "${errorText}"`);
      failed++;
    }

    // Status should NOT show "Saved" while error exists
    if (!errorText.includes("Saved")) {
      console.log(`  ✓ Status does not show 'Saved' while error exists`);
      passed++;
    } else {
      console.error(`  ❌ Status incorrectly shows 'Saved' despite error`);
      failed++;
    }

    // Check for Retry button with 44px minimum tap target
    const retryButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Retry"));
    
    if (retryButton) {
      // In JSDOM, Tailwind classes may not be computed, so check className
      const hasMinSize = retryButton.className.includes('min-h-[44px]') && 
                         retryButton.className.includes('min-w-[44px]');
      
      if (hasMinSize) {
        console.log(`  ✓ Retry button has 44px+ tap target classes`);
        passed++;
      } else {
        console.error(`  ❌ Retry button missing min-h/min-w classes: ${retryButton.className}`);
        failed++;
      }
    } else {
      console.error(`  ❌ Retry button not found`);
      failed++;
    }

    // TODO: Test Retry click and verify "Saved" appears after success
    // This would require a more complex spy that changes behavior on retry
  });
}

runTests().then(() => {
  console.log(`\n${passed > 0 ? "✅" : ""}${passed} passed, ${failed > 0 ? "❌" : ""}${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
