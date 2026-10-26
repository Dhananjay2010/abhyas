import { createRetryScheduler } from "@/lib/session/pending-set-retry-scheduler";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

type TimerId = number | NodeJS.Timeout;

class ManualClock {
  private currentTime = 0;
  private scheduledCallbacks: Array<{ time: number; callback: () => void; id: TimerId }> = [];
  private nextId = 1;

  setTimeout = (callback: () => void, ms: number): TimerId => {
    const id = this.nextId++;
    this.scheduledCallbacks.push({
      time: this.currentTime + ms,
      callback,
      id,
    });
    return id;
  };

  clearTimeout = (id: TimerId): void => {
    this.scheduledCallbacks = this.scheduledCallbacks.filter(c => c.id !== id);
  };

  advance(ms: number): void {
    this.currentTime += ms;
    const toRun = this.scheduledCallbacks.filter(c => c.time <= this.currentTime);
    this.scheduledCallbacks = this.scheduledCallbacks.filter(c => c.time > this.currentTime);
    toRun.forEach(c => c.callback());
  }
}

function testCleanupRemovesOnlineListener() {
  console.log("\n▶ Testing cleanup removes online listener...");
  
  const target = new EventTarget();
  const clock = new ManualClock();
  let replayCount = 0;
  let removeListenerCalled = false;
  
  const retry = createRetryScheduler({
    timer: { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout },
    addEventListener: (type, handler) => {
      console.log("  [DEBUG] addEventListener called");
      target.addEventListener(type, handler);
    },
    removeEventListener: (type, handler) => {
      console.log("  [DEBUG] removeEventListener called");
      removeListenerCalled = true;
      target.removeEventListener(type, handler);
    },
  });
  
  retry.scheduleRetry(() => {
    replayCount++;
  });
  
  // Verify listener is active before cleanup
  target.dispatchEvent(new Event('online'));
  assert(replayCount === 1, "Listener should work before cleanup");
  
  console.log(`  [DEBUG] Before cleanup, removeListenerCalled=${removeListenerCalled}`);
  
  // Cleanup should remove the listener
  retry.cleanup();
  
  console.log(`  [DEBUG] After cleanup, removeListenerCalled=${removeListenerCalled}`);
  
  assert(removeListenerCalled, "removeEventListener must be called during cleanup");
  console.log("  ✓ Cleanup calls removeEventListener");
}

function testCleanupClearsTimers() {
  console.log("\n▶ Testing cleanup clears timers...");
  
  const target = new EventTarget();
  const clock = new ManualClock();
  let replayCount = 0;
  let clearTimeoutCalled = false;
  
  const retry = createRetryScheduler({
    timer: { 
      setTimeout: clock.setTimeout, 
      clearTimeout: (id) => {
        clearTimeoutCalled = true;
        clock.clearTimeout(id);
      },
    },
    addEventListener: (type, handler) => target.addEventListener(type, handler),
    removeEventListener: (type, handler) => target.removeEventListener(type, handler),
  });
  
  retry.scheduleRetry(() => {
    replayCount++;
  });
  
  // Cleanup should clear the timer
  retry.cleanup();
  
  assert(clearTimeoutCalled, "clearTimeout must be called during cleanup");
  
  // Advance clock - should NOT trigger replay
  clock.advance(100000);
  
  assert(replayCount === 0, "Replay should not be called after cleanup");
  console.log("  ✓ Cleanup clears timers (clearTimeout called)");
}

console.log("Testing Cleanup with Real EventTarget and Manual Clock");
console.log("=====================================================");

testCleanupRemovesOnlineListener();
testCleanupClearsTimers();

console.log("\n✅ All cleanup tests passed\n");
