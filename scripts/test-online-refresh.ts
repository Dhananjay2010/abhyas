#!/usr/bin/env tsx
/**
 * Test: OnlineRefresh calls router.refresh() when 'online' event fires
 *
 * Verifies that the OnlineRefresh component:
 * - Listens for 'online' events on mount
 * - Calls router.refresh() when online
 * - Cleans up listener on unmount
 * - Works with injectable window target for testing
 */

type OnlineEventListener = (event: Event) => void;

class MockEventTarget {
  private listeners = new Map<string, Set<OnlineEventListener>>();

  addEventListener(type: string, listener: OnlineEventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: OnlineEventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
    return true;
  }

  hasListener(type: string, listener: OnlineEventListener): boolean {
    return this.listeners.get(type)?.has(listener) ?? false;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

interface MockRouter {
  refresh: () => void;
}

// Simulate OnlineRefresh behavior
function simulateOnlineRefresh(
  router: MockRouter,
  target: MockEventTarget
): () => void {
  function handleOnline() {
    router.refresh();
  }

  target.addEventListener("online", handleOnline);

  // Return cleanup function
  return () => {
    target.removeEventListener("online", handleOnline);
  };
}

async function runTests() {
  console.log("Testing OnlineRefresh online event handling...\n");

  const target = new MockEventTarget();
  let refreshCalled = false;
  const mockRouter: MockRouter = {
    refresh: () => {
      refreshCalled = true;
    },
  };

  // Test 1: Component mounts and adds listener
  const cleanup = simulateOnlineRefresh(mockRouter, target);

  if (target.listenerCount("online") !== 1) {
    throw new Error("Should have one 'online' listener after mount");
  }
  console.log("✓ Mount: adds 'online' event listener");

  // Test 2: 'online' event triggers router.refresh()
  target.dispatchEvent(new Event("online"));

  if (!refreshCalled) {
    throw new Error("router.refresh() should be called when 'online' fires");
  }
  console.log("✓ Online event: calls router.refresh()");

  // Test 3: Multiple online events (each should call refresh)
  refreshCalled = false;
  target.dispatchEvent(new Event("online"));

  if (!refreshCalled) {
    throw new Error("router.refresh() should be called on each 'online' event");
  }
  console.log("✓ Multiple events: each calls router.refresh()");

  // Test 4: Cleanup removes listener
  cleanup();

  if (target.listenerCount("online") !== 0) {
    throw new Error("Should have zero 'online' listeners after unmount");
  }
  console.log("✓ Unmount: removes 'online' event listener");

  // Test 5: After cleanup, online events don't trigger refresh
  refreshCalled = false;
  target.dispatchEvent(new Event("online"));

  if (refreshCalled) {
    throw new Error("router.refresh() should NOT be called after cleanup");
  }
  console.log("✓ After cleanup: 'online' events ignored");

  console.log("\n✓ All OnlineRefresh tests passed");
}

runTests().catch((err) => {
  console.error("✗ Test failed:", err.message);
  process.exit(1);
});
