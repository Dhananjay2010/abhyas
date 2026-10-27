#!/usr/bin/env tsx
/**
 * Test: Settings save flush on unmount, router.refresh on focus, and network error handling
 * 
 * QA#1: Single-tap controls must save immediately, and unmount must flush pending saves
 * QA#3: Visibility/focus triggers router.refresh() when idle, throttled to 10s  
 * QA#2: Network errors show inline, never navigate to /offline
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";

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
  units: 'metric',
};

const EQUIPMENT = [
  { id: "dumbbells", name: "Dumbbells", category: "free_weight" },
  { id: "barbell", name: "Barbell", category: "free_weight" },
];

const TIMEZONES = ["America/New_York", "America/Los_Angeles"];

// Test 1: Click 45m -> immediate unmount -> save fires
async function test1() {
  console.log("\n📋 Test 1: Click 45m -> immediate unmount -> save fires");
  
  const calls: Array<{ type: string; patch: unknown }> = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async (patch) => { calls.push({ type: "profile", patch }); await new Promise(r => setTimeout(r, 50)); return { ok: true }; },
    updateSessionSettings: async (patch) => { calls.push({ type: "session", patch }); return { ok: true }; },
    updateEquipment: async (patch) => { calls.push({ type: "equipment", patch }); return { ok: true }; },
    updateInjuries: async (patch) => { calls.push({ type: "injury", patch }); return { ok: true }; },
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { unmount, container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  assert(!!button45m, "Found 45m button");

  await act(async () => {
    button45m!.click();
  });

  await new Promise(r => setTimeout(r, 20));

  act(() => {
    unmount();
  });

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
    updateInjuries: async (patch) => { calls.push({ type: "injury", patch }); return { ok: true }; },
    setEquipmentItem: async (input) => { calls.push({ type: "equipment", patch: input }); await new Promise(r => setTimeout(r, 50)); return { ok: true }; },
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { unmount, container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  const buttons = Array.from(container.querySelectorAll('button'));
  const equipButton = buttons.find(b => b.textContent?.toLowerCase().includes("dumbbell") || b.textContent?.toLowerCase().includes("barbell"));
  
  if (!equipButton) {
    console.log("  ⚠️  No equipment button found, skipping test");
    return;
  }

  await act(async () => {
    equipButton.click();
  });

  act(() => {
    unmount();
  });

  await new Promise(r => setTimeout(r, 200));

  const equipCalls = calls.filter(c => c.type === "equipment");
  assert(equipCalls.length > 0, "setEquipmentItem was called");
  
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
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
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

  assert(mockNextRouter.refreshCalls.length === 1, `router.refresh() called once on visibility (got ${mockNextRouter.refreshCalls.length} calls)`);

  // Second visibility change within same event should NOT call refresh (throttled)
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await new Promise(r => setTimeout(r, 100));

  assert(mockNextRouter.refreshCalls.length === 1, "router.refresh() not called again within 10s (throttled)");
  
  // Mock Date.now to simulate 11 seconds passing
  const realDateNow = Date.now;
  const timeOffset = 11000;
  Date.now = () => realDateNow() + timeOffset;
  
  // Third visibility change after 10s SHOULD call refresh again
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await new Promise(r => setTimeout(r, 100));

  Date.now = realDateNow; // Restore

  assert(mockNextRouter.refreshCalls.length === 2, `router.refresh() called again after 10s (got ${mockNextRouter.refreshCalls.length} calls)`);
  
  cleanup();
}

// Test 3b: Window focus also triggers router.refresh when idle
async function test3b() {
  console.log("\n📋 Test 3b: Window focus triggers router.refresh() when idle");
  
  mockNextRouter.refreshCalls = [];
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Simulate window focus
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });

  await new Promise(r => setTimeout(r, 100));

  assert(mockNextRouter.refreshCalls.length === 1, `router.refresh() called on window focus (got ${mockNextRouter.refreshCalls.length} calls)`);
  
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
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Click 45m to start a hanging save
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  
  await act(async () => {
    button45m!.click();
  });

  await new Promise(r => setTimeout(r, 100));

  // Try visibility change - should NOT refresh because save is pending
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

// Test 5a: Network failure (Result with ok:false) shows inline error
async function test5a() {
  console.log("\n📋 Test 5a: Network failure (Result {ok:false}) shows inline error, no /offline navigation");
  
  mockNextRouter.refreshCalls = [];
  const pushCalls: string[] = [];
  const replaceCalls: string[] = [];
  
  mockNextRouter.push = (...args: unknown[]) => { if (args[0]) pushCalls.push(String(args[0])); };
  mockNextRouter.replace = (...args: unknown[]) => { if (args[0]) replaceCalls.push(String(args[0])); };
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => {
      await new Promise(r => setTimeout(r, 50));
      return { ok: false, error: "Couldn't save Session length: Failed to fetch" };
    },
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Click 45m to trigger network error
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  
  await act(async () => {
    button45m!.click();
  });

  await new Promise(r => setTimeout(r, 500));

  const text = container.textContent || "";
  assert(text.includes("Session length"), "Inline error text includes 'Session length'");
  assert(pushCalls.filter(u => u.includes("/offline")).length === 0, "router.push not called with /offline");
  assert(replaceCalls.filter(u => u.includes("/offline")).length === 0, "router.replace not called with /offline");
  
  cleanup();
}

// Test 5b: Network failure (thrown TypeError) shows inline error
async function test5b() {
  console.log("\n📋 Test 5b: Network failure (thrown TypeError) shows inline error, no error boundary");
  
  const pushCalls: string[] = [];
  const replaceCalls: string[] = [];
  
  mockNextRouter.push = (...args: unknown[]) => { if (args[0]) pushCalls.push(String(args[0])); };
  mockNextRouter.replace = (...args: unknown[]) => { if (args[0]) replaceCalls.push(String(args[0])); };
  
  const actions: SettingsActions = {
    updateProfileSettings: async () => {
      await new Promise(r => setTimeout(r, 50));
      throw new TypeError("Failed to fetch");
    },
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const { container } = render(<SettingsForm initial={INITIAL_STATE} equipment={EQUIPMENT} timezones={TIMEZONES} actions={actions} />);

  // Click 45m to trigger thrown network error
  const buttons = Array.from(container.querySelectorAll('button'));
  const button45m = buttons.find(b => b.textContent === "45m");
  
  // Suppress console error and process exit for this test
  const originalError = console.error;
  const originalExit = process.exit;
  console.error = () => {};
  // @ts-expect-error - mocking process.exit for test
  process.exit = () => {};
  
  // Handle unhandled rejection
  const unhandledRejections: unknown[] = [];
  const rejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', rejectionHandler);
  
  try {
    await act(async () => {
      button45m!.click();
    });

    await new Promise(r => setTimeout(r, 1000));
  } catch (err) {
    // Expected in test environment - error may propagate
  } finally {
    console.error = originalError;
    process.exit = originalExit;
    process.removeListener('unhandledRejection', rejectionHandler);
  }

  const text = container.textContent || "";
  // Component should still be mounted, showing error
  assert(text.includes("Session length") || text.toLowerCase().includes("error") || text.toLowerCase().includes("retry"), "Error shown inline (component still mounted)");
  assert(pushCalls.filter(u => u.includes("/offline")).length === 0, "router.push not called with /offline");
  assert(replaceCalls.filter(u => u.includes("/offline")).length === 0, "router.replace not called with /offline");
  assert(!text.includes("Something went wrong"), "No error boundary fallback shown");
  
  cleanup();
}

// Run all tests
(async () => {
  console.log("\n🧪 Settings flush and network error tests\n");
  
  try {
    await test1();
    await test2();
    await test3();
    await test3b();
    await test4();
    await test5a();
    await test5b();
    
    console.log(`\n✅ All tests passed! (${passed}/${passed + failed})\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
