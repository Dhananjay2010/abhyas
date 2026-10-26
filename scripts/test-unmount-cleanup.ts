import { createRetryScheduler } from "@/lib/session/pending-set-retry-scheduler";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

class MockEventTarget {
  private listeners: Map<string, Set<() => void>> = new Map();
  
  addEventListener = (event: string, listener: () => void): void => {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }
  
  removeEventListener = (event: string, listener: () => void): void => {
    this.listeners.get(event)?.delete(listener);
  }
  
  hasListener(event: string): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }
  
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

class MockScheduler {
  private timers: Set<any> = new Set();
  
  setTimeout = (callback: () => void, delay: number): any => {
    const timer = { callback, delay };
    this.timers.add(timer);
    return timer;
  }
  
  clearTimeout = (timer: any): void => {
    this.timers.delete(timer);
  }
  
  hasActiveTimers(): boolean {
    return this.timers.size > 0;
  }
  
  getTimerCount(): number {
    return this.timers.size;
  }
}

function testCleanupRemovesOnlineListener() {
  console.log("\n▶ Testing cleanup removes online listener...");
  
  const target = new MockEventTarget();
  const scheduler = new MockScheduler();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retry = createRetryScheduler({
    timer: { setTimeout: scheduler.setTimeout, clearTimeout: scheduler.clearTimeout },
    addEventListener: target.addEventListener,
    removeEventListener: target.removeEventListener
  });
  
  assert(target.hasListener("online"), "Should register online listener");
  
  retry.cleanup();
  
  assert(!target.hasListener("online"), "Should remove online listener");
  console.log("  ✓ Cleanup removes online listener");
}

function testCleanupClearsTimers() {
  console.log("\n▶ Testing cleanup clears timers...");
  
  const target = new MockEventTarget();
  const scheduler = new MockScheduler();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retry = createRetryScheduler({
    timer: { setTimeout: scheduler.setTimeout, clearTimeout: scheduler.clearTimeout },
    addEventListener: target.addEventListener,
    removeEventListener: target.removeEventListener
  });
  
  retry.scheduleRetry(() => {});
  
  assert(scheduler.hasActiveTimers(), "Should have active timer after schedule");
  
  retry.cleanup();
  
  assert(!scheduler.hasActiveTimers(), "Should clear all timers");
  console.log("  ✓ Cleanup clears timers");
}

console.log("Testing Unmount Cleanup");
console.log("======================");

try {
  testCleanupRemovesOnlineListener();
  testCleanupClearsTimers();
  console.log("\n✅ All unmount cleanup tests passed\n");
} catch (err: any) {
  console.error(`\n❌ Test error: ${err.message}\n`);
  process.exit(1);
}
