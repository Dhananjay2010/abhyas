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

  // Test 7: attachResumeRefresh calls refresh on mount
  await testResumeRefresh("attachResumeRefresh: calls refresh exactly once on mount", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    assertEqualRefresh(refreshCalled, 1, "Should call refresh exactly once on mount");
  });

  // Test 8: attachResumeRefresh calls refresh on visibilitychange to visible (on doc)
  await testResumeRefresh("attachResumeRefresh: visibilitychange on doc (visible) calls refresh", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    // Simulate visibilitychange on doc
    if (docListeners.visibilitychange) {
      docListeners.visibilitychange[0](new Event("visibilitychange"));
    }

    assertEqualRefresh(refreshCalled, 2, "Should call refresh on mount + visibilitychange");
    cleanup();
  });

  // Test 9: attachResumeRefresh does not call refresh on visibilitychange to hidden
  await testResumeRefresh("attachResumeRefresh: visibilitychange on doc (hidden) does not call refresh", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "hidden",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    // Simulate visibilitychange to hidden on doc
    if (docListeners.visibilitychange) {
      docListeners.visibilitychange[0](new Event("visibilitychange"));
    }

    assertEqualRefresh(refreshCalled, 1, "Should call refresh only on mount, not on visibilitychange hidden");
    cleanup();
  });

  // Test 10: attachResumeRefresh calls refresh on pageshow with persisted (on win)
  await testResumeRefresh("attachResumeRefresh: pageshow on win (persisted=true) calls refresh", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    // Simulate pageshow with persisted on win
    if (winListeners.pageshow) {
      const event = { persisted: true } as PageTransitionEvent;
      winListeners.pageshow[0](event as unknown as Event);
    }

    assertEqualRefresh(refreshCalled, 2, "Should call refresh on mount + pageshow");
    cleanup();
  });

  // Test 11: BUG - pageshow dispatched on doc does NOT refresh (pageshow doesn't bubble)
  await testResumeRefresh("BUG: pageshow on doc (persisted=true) does NOT call refresh", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    // Simulate pageshow on doc (wrong target - should not trigger)
    if (docListeners.pageshow) {
      const event = { persisted: true } as PageTransitionEvent;
      docListeners.pageshow[0](event as unknown as Event);
    }

    assertEqualRefresh(refreshCalled, 1, "Should only call refresh on mount, not on pageshow on doc");
    cleanup();
  });

  // Test 12: visibilitychange on win does nothing (visibilitychange is on document)
  await testResumeRefresh("BUG: visibilitychange on win does NOT call refresh", () => {
    let refreshCalled = 0;
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {
      refreshCalled++;
    });

    // Simulate visibilitychange on win (wrong target - should not trigger)
    if (winListeners.visibilitychange) {
      winListeners.visibilitychange[0](new Event("visibilitychange"));
    }

    assertEqualRefresh(refreshCalled, 1, "Should only call refresh on mount, not on visibilitychange on win");
    cleanup();
  });

  // Test 13: cleanup removes both listeners from their respective targets
  await testResumeRefresh("attachResumeRefresh: cleanup removes both listeners from correct targets", () => {
    const docListeners: Record<string, EventListener[]> = {};
    const winListeners: Record<string, EventListener[]> = {};
    
    const fakeDoc = {
      visibilityState: "visible",
      addEventListener: (event: string, handler: EventListener) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (docListeners[event]) {
          docListeners[event] = docListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Document;

    const fakeWin = {
      addEventListener: (event: string, handler: EventListener) => {
        if (!winListeners[event]) winListeners[event] = [];
        winListeners[event].push(handler);
      },
      removeEventListener: (event: string, handler: EventListener) => {
        if (winListeners[event]) {
          winListeners[event] = winListeners[event].filter((h) => h !== handler);
        }
      },
    } as unknown as Window;

    const cleanup = attachResumeRefresh({ doc: fakeDoc, win: fakeWin }, () => {});

    assertEqualRefresh(docListeners.visibilitychange?.length, 1, "Should have 1 visibilitychange listener on doc");
    assertEqualRefresh(winListeners.pageshow?.length, 1, "Should have 1 pageshow listener on win");

    cleanup();

    assertEqualRefresh(docListeners.visibilitychange?.length, 0, "Should remove visibilitychange listener from doc");
    assertEqualRefresh(winListeners.pageshow?.length, 0, "Should remove pageshow listener from win");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
