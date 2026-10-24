#!/usr/bin/env tsx
/**
 * Test Today page refetch on resume
 *
 * Tests that useResumeRefresh triggers router.refresh on appropriate events:
 * - mount
 * - visibilitychange (when becoming visible)
 * - pageshow (when persisted/bfcache)
 */

import {
  shouldRefreshOnEvent,
  attachResumeRefresh,
  type DocumentLike,
  type WindowLike,
  type PageShowLike,
} from "../src/lib/session/use-resume-refresh";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Testing Today page refetch on resume\n");

  // Test 1: shouldRefreshOnEvent decision logic
  await test("shouldRefreshOnEvent returns true for mount", () => {
    assert(shouldRefreshOnEvent("mount") === true, "Should refresh on mount");
  });

  await test("shouldRefreshOnEvent returns true for visibilitychange to visible", () => {
    assert(
      shouldRefreshOnEvent("visibilitychange", "visible") === true,
      "Should refresh when becoming visible",
    );
  });

  await test("shouldRefreshOnEvent returns false for visibilitychange to hidden", () => {
    assert(
      shouldRefreshOnEvent("visibilitychange", "hidden") === false,
      "Should not refresh when becoming hidden",
    );
  });

  await test("shouldRefreshOnEvent returns true for pageshow with persisted=true", () => {
    assert(
      shouldRefreshOnEvent("pageshow", undefined, true) === true,
      "Should refresh on bfcache pageshow",
    );
  });

  await test("shouldRefreshOnEvent returns false for pageshow with persisted=false", () => {
    assert(
      shouldRefreshOnEvent("pageshow", undefined, false) === false,
      "Should not refresh on non-bfcache pageshow",
    );
  });

  // Test 2: attachResumeRefresh calls refresh on mount
  await test("attachResumeRefresh calls refresh immediately on mount", () => {
    let refreshCount = 0;
    const mockDoc: DocumentLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {
      refreshCount++;
    });

    assert(refreshCount === 1, `Expected 1 refresh on mount, got ${refreshCount}`);
  });

  // Test 3: attachResumeRefresh sets up visibilitychange listener
  await test("attachResumeRefresh sets up visibilitychange listener", () => {
    let visibilityListenerAdded = false;
    const mockDoc: DocumentLike = {
      addEventListener() {
        visibilityListenerAdded = true;
      },
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {});

    assert(visibilityListenerAdded, "Should add visibilitychange listener");
  });

  // Test 4: attachResumeRefresh sets up pageshow listener
  await test("attachResumeRefresh sets up pageshow listener", () => {
    let pageshowListenerAdded = false;
    const mockDoc: DocumentLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener() {
        pageshowListenerAdded = true;
      },
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {});

    assert(pageshowListenerAdded, "Should add pageshow listener");
  });

  // Test 5: visibilitychange handler calls refresh when becoming visible
  await test("visibilitychange handler calls refresh when becoming visible", () => {
    let refreshCount = 0;
    const captured: { visibility: (() => void) | null } = { visibility: null };

    const mockDoc: DocumentLike = {
      addEventListener(_type: "visibilitychange", handler: () => void) {
        captured.visibility = handler;
      },
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {
      refreshCount++;
    });

    // Initial mount refresh
    assert(refreshCount === 1, "Should have 1 refresh from mount");

    // Simulate visibilitychange event
    mockDoc.visibilityState = "visible";
    if (captured.visibility) captured.visibility();

    assert(refreshCount === 2, `Expected 2 refreshes after visibilitychange, got ${refreshCount}`);
  });

  // Test 6: pageshow handler calls refresh when persisted=true
  await test("pageshow handler calls refresh when persisted=true", () => {
    let refreshCount = 0;
    const captured: { pageshow: ((event: PageShowLike) => void) | null } = { pageshow: null };

    const mockDoc: DocumentLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener(_type: "pageshow", handler: (event: PageShowLike) => void) {
        captured.pageshow = handler;
      },
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {
      refreshCount++;
    });

    // Initial mount refresh
    assert(refreshCount === 1, "Should have 1 refresh from mount");

    // Simulate pageshow event with persisted=true (bfcache restore)
    if (captured.pageshow) captured.pageshow({ persisted: true });

    assert(refreshCount === 2, `Expected 2 refreshes after bfcache pageshow, got ${refreshCount}`);
  });

  // Test 7: pageshow handler does NOT call refresh when persisted=false
  await test("pageshow handler does not call refresh when persisted=false", () => {
    let refreshCount = 0;
    const captured: { pageshow: ((event: PageShowLike) => void) | null } = { pageshow: null };

    const mockDoc: DocumentLike = {
      addEventListener: () => {},
      removeEventListener: () => {},
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener(_type: "pageshow", handler: (event: PageShowLike) => void) {
        captured.pageshow = handler;
      },
      removeEventListener: () => {},
    };

    attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {
      refreshCount++;
    });

    // Initial mount refresh
    assert(refreshCount === 1, "Should have 1 refresh from mount");

    // Simulate pageshow event with persisted=false (normal page load)
    if (captured.pageshow) captured.pageshow({ persisted: false });

    assert(refreshCount === 1, `Expected 1 refresh (no new refresh), got ${refreshCount}`);
  });

  // Test 8: cleanup function removes listeners
  await test("cleanup function removes event listeners", () => {
    let visibilityListenerRemoved = false;
    let pageshowListenerRemoved = false;

    const mockDoc: DocumentLike = {
      addEventListener: () => {},
      removeEventListener() {
        visibilityListenerRemoved = true;
      },
      visibilityState: "visible",
    };
    const mockWin: WindowLike = {
      addEventListener: () => {},
      removeEventListener() {
        pageshowListenerRemoved = true;
      },
    };

    const cleanup = attachResumeRefresh({ doc: mockDoc, win: mockWin }, () => {});
    cleanup();

    assert(visibilityListenerRemoved, "Should remove visibilitychange listener");
    assert(pageshowListenerRemoved, "Should remove pageshow listener");
  });

  // Test 9: RefetchOnResume component exists
  await test("RefetchOnResume component can be imported", async () => {
    const { RefetchOnResume } = await import("../src/app/today/refetch-on-resume");
    assert(typeof RefetchOnResume === "function", "RefetchOnResume should be a function");
  });

  // Test 10: useResumeRefresh hook exists
  await test("useResumeRefresh hook can be imported", async () => {
    const { useResumeRefresh } = await import("../src/lib/session/use-resume-refresh");
    assert(typeof useResumeRefresh === "function", "useResumeRefresh should be a function");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
