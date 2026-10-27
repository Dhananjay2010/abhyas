#!/usr/bin/env tsx
/**
 * Test: Today SignOutForm with H1 behavior
 * 
 * H1: Sign-out never deletes unsynced sets.
 * Tests that SignOutForm follows H1 requirements.
 * (See test-signout-h1-never-delete.tsx for comprehensive H1 tests)
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";
import { render, act, screen, cleanup } from "@testing-library/react";
import { SignOutForm } from "../src/app/today/signout-form";
import { savePendingSet, storageKey } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Storage } from "../src/lib/session/pending-set-retry";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  get length() { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) || null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] || null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const fakeStorage = new FakeStorage();
Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { nowFn: () => FIXED_TIME };

(async () => {
  console.log("\n📋 Test: SignOutForm H1 compatibility\n");
  
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(refreshCalls.length);
  };
  
  // ========================================================================
  // Test 1: Empty queue signs out immediately
  // ========================================================================
  console.log("=== Test 1: Empty queue signs out ===\n");
  
  fakeStorage.clear();
  
  const signOutSuccess = async () => {
    return { ok: true as const };
  };
  
  const logSetSuccess = async () => ({ ok: true as const });
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u1"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  await act(async () => {
    const button = screen.getByRole("button");
    button.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "Navigates to / on empty queue");
  
  cleanup();
  console.log("✓ Test 1: Empty queue passed\n");
  
  // ========================================================================
  // Test 2: Replay succeeds → queue removed, signs out
  // ========================================================================
  console.log("=== Test 2: Replay success ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u2", "s2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u2-set"
  }, fakeDeps);
  
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "u2 queue exists before");
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u2"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u2")) === null, "u2 queue cleared after replay success");
  assert(replaceCalls.length === 1, "Navigates after replay success");
  
  cleanup();
  console.log("✓ Test 2: Replay success passed\n");
  
  // ========================================================================
  // Test 3: Replay fails → warning, queue kept, no sign-out
  // ========================================================================
  console.log("=== Test 3: Replay fails → warning ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u3", "s3", {
    sessionExerciseId: "ex3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u3-set"
  }, fakeDeps);
  
  const queueBefore = fakeStorage.getItem(storageKey("u3"));
  const logSetFail = async () => ({ ok: false as const, error: "Network error" });
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u3"
      signOut={signOutSuccess}
      logSet={logSetFail}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u3")) === queueBefore, "u3 queue kept after replay fail");
  assert(replaceCalls.length === 0, "No navigation when replay fails");
  assert(screen.queryByText(/hasn'?t synced yet/i) !== null, "Shows warning");
  
  cleanup();
  console.log("✓ Test 3: Replay fails passed\n");
  
  // ========================================================================
  // Test 4: Expired session on "Sign out anyway" → keeps queue, calls /auth/signout POST, navigates
  // ========================================================================
  console.log("=== Test 4: Expired session path (Sign out anyway) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u4", "session-4", {
    sessionExerciseId: "ex4",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u4"
  }, fakeDeps);
  
  const queueBeforeExpired = fakeStorage.getItem(storageKey("u4"));
  
  const signOutExpired = async () => {
    throw new Error("SESSION_EXPIRED:abc123");
  };
  
  let fetchCalled = false;
  let fetchPath = "";
  let fetchMethod = "";
  
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalled = true;
    fetchPath = typeof input === 'string' ? input : input.toString();
    fetchMethod = init?.method || "GET";
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u4"
      signOut={signOutExpired}
      logSet={logSetFail}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  // First click - triggers replay which fails, shows warning
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Now click "Sign out anyway" which triggers expired session path
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u4")) === queueBeforeExpired, "u4 queue kept on expired session");
  assert(fetchCalled, "/auth/signout POST was made");
  assert(fetchPath === "/auth/signout", "POST to /auth/signout");
  assert(fetchMethod === "POST", "Method is POST");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "Navigates after expired session");
  assert(refreshCalls.length === 1, "router.refresh called after expired");
  
  global.fetch = originalFetch;
  cleanup();
  console.log("✓ Test 4 passed\n");
  
  // ========================================================================
  // Test 5: Non-expired throw on "Sign out anyway" → keeps queue, shows error, no navigation
  // ========================================================================
  console.log("=== Test 5: Non-expired throw (Sign out anyway) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u5", "session-5", {
    sessionExerciseId: "ex5",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u5"
  }, fakeDeps);
  
  const queueBeforeThrow = fakeStorage.getItem(storageKey("u5"));
  
  const signOutThrow = async () => {
    throw new Error("Network timeout");
  };
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u5"
      signOut={signOutThrow}
      logSet={logSetFail}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  // First click - triggers replay which fails, shows warning
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Now click "Sign out anyway" which triggers throw
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u5")) === queueBeforeThrow, "u5 queue kept on throw");
  assert(replaceCalls.length === 0, "No navigation on non-expired throw");
  assert(screen.queryByText(/Unable to sign out/i) !== null, "Shows error message");
  
  cleanup();
  console.log("✓ Test 5 passed\n");
  
  // ========================================================================
  // Test 6: {ok:false} result on "Sign out anyway" → keeps queue, shows error, no navigation
  // ========================================================================
  console.log("=== Test 6: {ok:false} result (Sign out anyway) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u6", "session-6", {
    sessionExerciseId: "ex6",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u6"
  }, fakeDeps);
  
  const queueBeforeOkFalse = fakeStorage.getItem(storageKey("u6"));
  
  const signOutOkFalse = async () => {
    return { ok: false as const, error: "Invalid session" };
  };
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u6"
      signOut={signOutOkFalse}
      logSet={logSetFail}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  // First click - triggers replay which fails, shows warning
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Now click "Sign out anyway" which triggers ok:false
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u6")) === queueBeforeOkFalse, "u6 queue kept on ok:false");
  assert(replaceCalls.length === 0, "No navigation on ok:false");
  assert(screen.queryByText(/Unable to sign out/i) !== null, "Shows error on ok:false");
  
  cleanup();
  console.log("✓ Test 6 passed\n");
  
  // ========================================================================
  // Test 7: Non-ok /auth/signout on expired session → shows error, no navigation, queue kept
  // ========================================================================
  console.log("=== Test 7: Non-ok /auth/signout POST (Sign out anyway) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u7", "session-7", {
    sessionExerciseId: "ex7",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u7"
  }, fakeDeps);
  
  const queueBeforeNonOk = fakeStorage.getItem(storageKey("u7"));
  
  const signOutExpired2 = async () => {
    throw new Error("SESSION_EXPIRED:xyz789");
  };
  
  global.fetch = async () => {
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  };
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u7"
      signOut={signOutExpired2}
      logSet={logSetFail}
      nowFn={new Date(FIXED_TIME)}
    />
  );
  
  // First click - triggers replay which fails, shows warning
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Now click "Sign out anyway" which triggers expired session path with non-ok POST
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u7")) === queueBeforeNonOk, "u7 queue kept on non-ok POST");
  assert(replaceCalls.length === 0, "No navigation on non-ok POST");
  assert(screen.queryByText(/Failed to sign out/i) !== null, "Shows error on non-ok POST");
  
  global.fetch = originalFetch;
  cleanup();
  console.log("✓ Test 7 passed\n");
  
  console.log(`✅ H1 compatibility tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
