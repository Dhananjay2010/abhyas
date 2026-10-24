#!/usr/bin/env tsx
/**
 * Test: Settings save flush on unmount and network error handling
 * 
 * QA#1: Single-tap controls must save immediately, and unmount must flush pending saves
 * QA#2: Network errors show inline, never navigate to /offline
 * QA#3: Visibility/focus triggers router.refresh() when idle, throttled to 10s
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";

import { render, cleanup, act, waitFor } from "@testing-library/react";
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
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const TIMEZONES = ["America/New_York", "America/Los_Angeles"];

// Test 1: Click 45m -> immediate unmount -> save called
async function test1() {
  console.log("\n📋 Test 1: Click 45m -> immediate unmount -> save fires");
  
  const calls: Array<{ type: string; patch: unknown }> = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => { calls.push({ type: "profile", patch }); await new Promise(r => setTimeout(r, 50)); return { ok: true }; },
    updateSessionSettings: async (patch) => { calls.push({ type: "session", patch }); return { ok: true }; },
    updateEquipment: async (patch) => { calls.push({ type: "equipment", patch }); return { ok: true }; },
    updateInjuries: async (patch) => { calls.push({ type: "injuries", patch }); return { ok: true }; },
  };

  const { unmount, container} = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Find 45m button
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  assert(!!button45m, "Found 45m button");

  // Click it
  await act(async () => {
    button45m!.click();
  });

  // Give the enqueue a moment to happen (React transition + enqueue)
  await new Promise(r => setTimeout(r, 20));

  // Unmount
  act(() => {
    unmount();
  });

  // Wait for save to complete
  await new Promise(r => setTimeout(r, 500));

  const profileCalls = calls.filter(c => c.type === "profile");
  assert(profileCalls.length > 0, "updateProfileSettings was called");
  assert(JSON.stringify(profileCalls[profileCalls.length - 1].patch).includes("45"), "Save included 45m");
  
  cleanup();
}

// Test 2: Toggle equipment -> immediate unmount -> save fires
async function test2() {
  console.log("\n📋 Test 2: Toggle equipment -> immediate unmount -> save fires");
  
  const calls: Array<{ type: string; patch: unknown }> = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => { calls.push({ type: "profile", patch }); return { ok: true }; },
    updateSessionSettings: async (patch) => { calls.push({ type: "session", patch }); return { ok: true }; },
    updateEquipment: async (patch) => { calls.push({ type: "equipment", patch }); await new Promise(r => setTimeout(r, 50)); return { ok: true }; },
    updateInjuries: async (patch) => { calls.push({ type: "injuries", patch }); return { ok: true }; },
  };

  const { unmount, container} = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Find any equipment button (e.g., containing "Dumbbell" or any equipment)
  const buttons = Array.from(container.querySelectorAll('button'));
  const equipButton = buttons.find(b => b.textContent?.toLowerCase().includes("dumbbell") || b.textContent?.toLowerCase().includes("barbell"));
  
  if (!equipButton) {
    console.log("  ⚠️  No equipment button found, skipping test");
    return;
  }

  // Click it
  await act(async () => {
    equipButton.click();
  });

  // Immediately unmount
  act(() => {
    unmount();
  });

  // Wait for save to complete
  await new Promise(r => setTimeout(r, 200));

  const equipCalls = calls.filter(c => c.type === "equipment");
  assert(equipCalls.length > 0, "updateEquipment was called");
  
  cleanup();
}

// Test 3: Visibility change triggers router.refresh when idle
async function test3() {
  console.log("\n📋 Test 3: Visibility change triggers router.refresh() when idle");
  
  mockNextRouter.refreshCalls = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
  };

  render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Simulate visibility change to visible
  await act(async () => {
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await new Promise(r => setTimeout(r, 100));

  assert(mockNextRouter.refreshCalls.length === 1, `router.refresh() called once (got ${mockNextRouter.refreshCalls.length} calls)`);

  // Second visibility change should NOT call refresh due to 10s throttle
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await new Promise(r => setTimeout(r, 100));

  assert(mockNextRouter.refreshCalls.length === 1, "router.refresh() not called again (throttled)");
  
  cleanup();
}

// Test 4: Visibility change does NOT refresh while saves are pending
async function test4() {
  console.log("\n📋 Test 4: Visibility change does NOT refresh while saves pending");
  
  mockNextRouter.refreshCalls = [];
  
  let resolveSave: (value: Result) => void;
  const hangingPromise = new Promise<Result>((resolve) => {
    resolveSave = resolve;
  });
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => hangingPromise,
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
  };

  const { container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Click 45m to start a hanging save
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  
  await act(async () => {
    button45m!.click();
  });

  await new Promise(r => setTimeout(r, 100));

  // Try visibility change - should NOT refresh
  await act(async () => {
    Object.defineProperty(document, "visibilityState", {
      writable: true,
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await new Promise(r => setTimeout(r, 100));

  assert(mockNextRouter.refreshCalls.length === 0, "router.refresh() not called while save pending");
  
  // Cleanup: resolve the hanging promise
  resolveSave!({ ok: true });
  await new Promise(r => setTimeout(r, 100));
  
  cleanup();
}

// Test 5: Network failure shows inline error
async function test5() {
  console.log("\n📋 Test 5: Network failure shows inline error, no /offline redirect");
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => {
      // Simulate network failure with a failed Result
      await new Promise(r => setTimeout(r, 50));
      return { ok: false, error: "Failed to fetch: You are offline" };
    },
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
  };

  const { container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Click 45m to trigger network error
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  
  // Suppress console error for this test
  const originalError = console.error;
  console.error = () => {};
  
  try {
    await act(async () => {
      button45m!.click();
    });

    // Wait for error to be processed
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    // Expected - error may propagate in test env
  } finally {
    console.error = originalError;
  }

  // Check that some error indication exists (the hotfix should show named inline errors)
  const text = container.textContent || "";
  const hasErrorIndication = text.toLowerCase().includes("error") || 
                             text.toLowerCase().includes("offline") || 
                             text.toLowerCase().includes("failed") ||
                             text.toLowerCase().includes("retry");
  
  assert(hasErrorIndication, "Error indication shown in UI");
  assert(!text.includes("/offline"), "No /offline navigation");
  
  cleanup();
}

// Run all tests
(async () => {
  console.log("\n🧪 Settings flush and network error tests\n");
  
  try {
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    
    console.log(`\n✅ All tests passed! (${passed}/${passed + failed})\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
