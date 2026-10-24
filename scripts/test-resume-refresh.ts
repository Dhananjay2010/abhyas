#!/usr/bin/env tsx
/*
 * Test: Resume refresh behavior
 *
 * Tests the extracted shouldRefreshOnEvent and attachResumeRefresh functions.
 */

import { shouldRefreshOnEvent, attachResumeRefresh } from "../src/lib/session/use-resume-refresh";

let passed = 0;
let failed = 0;

function testResumeRefresh(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqualRefresh<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing resume refresh behavior\n");

  // Test 1: mount always triggers refresh
  await testResumeRefresh("mount → refresh", () => {
    const should = shouldRefreshOnEvent("mount");
    assertEqualRefresh(should, true, "Should refresh on mount");
  });

  // Test 2: visibilitychange to visible triggers refresh
  await testResumeRefresh("visibilitychange (visible) → refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "visible");
    assertEqualRefresh(should, true, "Should refresh when becoming visible");
  });

  // Test 3: visibilitychange to hidden does not trigger refresh
  await testResumeRefresh("visibilitychange (hidden) → no refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "hidden");
    assertEqualRefresh(should, false, "Should not refresh when becoming hidden");
  });

  // Test 4: pageshow with persisted=true triggers refresh (bfcache)
  await testResumeRefresh("pageshow (persisted=true) → refresh", () => {
    const should = shouldRefreshOnEvent("pageshow", undefined, true);
    assertEqualRefresh(should, true, "Should refresh when restored from bfcache");
  });

  // Test 5: pageshow with persisted=false does not trigger refresh
  await testResumeRefresh("pageshow (persisted=false) → no refresh", () => {
    const should = shouldRefreshOnEvent("pageshow", undefined, false);
    assertEqualRefresh(should, false, "Should not refresh on normal pageshow");
  });

  // Test 6: B1 regression - resume after 30s triggers refresh
  await testResumeRefresh("B1: resume after backgrounding → refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "visible");
    assertEqualRefresh(should, true, "Should refresh to get fresh data on resume");
  });

  // Test 7: attachResumeRefresh calls refresh on visibility visible
  await testResumeRefresh("attachResumeRefresh: visibilitychange visible calls refresh", () => {
    let refreshCalled = 0;
    const listeners: Record<string, EventListener[]> = {};
    
    const fakeTarget = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
    };

    const cleanup = attachResumeRefresh(fakeTarget, () => {
      refreshCalled++;
    });

    // Simulate visibilitychange
    if (listeners.visibilitychange) {
      listeners.visibilitychange[0](new Event("visibilitychange"));
    }

    assertEqualRefresh(refreshCalled, 2, "Should call refresh on mount + visibilitychange");
    cleanup();
  });

  // Test 8: attachResumeRefresh does not call refresh on visibility hidden (only mount)
  await testResumeRefresh("attachResumeRefresh: visibilitychange hidden does not call refresh", () => {
    let refreshCalled = 0;
    const listeners: Record<string, EventListener[]> = {};
    
    const fakeTarget = {
      visibilityState: "hidden",
      addEventListener: (event: string, handler: EventListener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
    };

    const cleanup = attachResumeRefresh(fakeTarget, () => {
      refreshCalled++;
    });

    // Simulate visibilitychange to hidden
    if (listeners.visibilitychange) {
      listeners.visibilitychange[0](new Event("visibilitychange"));
    }

    assertEqualRefresh(refreshCalled, 1, "Should call refresh only on mount, not on visibilitychange hidden");
    cleanup();
  });

  // Test 9: attachResumeRefresh calls refresh on pageshow with persisted
  await testResumeRefresh("attachResumeRefresh: pageshow persisted calls refresh", () => {
    let refreshCalled = 0;
    const listeners: Record<string, EventListener[]> = {};
    
    const fakeTarget = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh(fakeTarget, () => {
      refreshCalled++;
    });

    // Simulate pageshow with persisted
    if (listeners.pageshow) {
      const event = { persisted: true } as PageTransitionEvent;
      listeners.pageshow[0](event as unknown as Event);
    }

    assertEqualRefresh(refreshCalled, 2, "Should call refresh once on mount + once on pageshow");
    cleanup();
  });

  // Test 10: attachResumeRefresh calls refresh exactly once on mount
  await testResumeRefresh("attachResumeRefresh: calls refresh exactly once on mount", () => {
    let refreshCalled = 0;
    const listeners: Record<string, EventListener[]> = {};
    
    const fakeTarget = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    attachResumeRefresh(fakeTarget, () => {
      refreshCalled++;
    });

    assertEqualRefresh(refreshCalled, 1, "Should call refresh exactly once on mount");
  });

  // Test 11: cleanup removes both listeners
  await testResumeRefresh("attachResumeRefresh: cleanup removes both listeners", () => {
    const listeners: Record<string, EventListener[]> = {};
    
    const fakeTarget = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh(fakeTarget, () => {});

    assertEqualRefresh(listeners.visibilitychange?.length, 1, "Should have 1 visibilitychange listener");
    assertEqualRefresh(listeners.pageshow?.length, 1, "Should have 1 pageshow listener");

    cleanup();

    assertEqualRefresh(listeners.visibilitychange?.length, 0, "Should remove visibilitychange listener");
    assertEqualRefresh(listeners.pageshow?.length, 0, "Should remove pageshow listener");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
