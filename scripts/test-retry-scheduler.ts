#!/usr/bin/env tsx
/**
 * Test: Retry scheduler with backoff
 * 
 * Verifies that the retry scheduler correctly schedules retries with the
 * backoff schedule (0, 15, 30, 60s, then every 60s) and responds to online events.
 */

import { createRetryScheduler, type RetryTimer } from "../src/lib/session/pending-set-retry-scheduler";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function createFakeTimer(): RetryTimer & {
  tick: (ms: number) => void;
  fireAll: () => void;
  pendingCount: () => number;
} {
  const callbacks: Array<{ callback: () => void; id: number; fireAt: number }> = [];
  let nextId = 1;
  let currentTime = 0;

  return {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.push({ callback, id, fireAt: currentTime + ms });
      return id;
    },
    clearTimeout: (id: number | NodeJS.Timeout) => {
      const index = callbacks.findIndex((c) => c.id === id);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    },
    tick: (ms: number) => {
      currentTime += ms;
      const toFire = callbacks.filter((c) => c.fireAt <= currentTime);
      toFire.forEach((c) => {
        const index = callbacks.indexOf(c);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }
        c.callback();
      });
    },
    fireAll: () => {
      while (callbacks.length > 0) {
        const c = callbacks.shift();
        if (c) {
          c.callback();
        }
      }
    },
    pendingCount: () => callbacks.length,
  };
}

function testBackoffSchedule() {
  console.log("\n▶ Testing backoff schedule (0, 15, 30, 60s, then 60s)...");

  const timer = createFakeTimer();
  const scheduler = createRetryScheduler({ timer });
  
  const retries: number[] = [];
  const onRetry = () => {
    retries.push(Date.now());
    if (retries.length < 6) {
      scheduler.scheduleRetry(onRetry);
    }
  };
  
  scheduler.scheduleRetry(onRetry);
  
  // First retry should be immediate (0ms)
  timer.tick(0);
  assert(retries.length === 1, "First retry should be immediate");
  
  // Second retry after 15s
  timer.tick(14999);
  assert(retries.length === 1, "Should not retry before 15s");
  timer.tick(1);
  assert(retries.length === 2, "Should retry after 15s");
  
  // Third retry after 30s
  timer.tick(29999);
  assert(retries.length === 2, "Should not retry before 30s");
  timer.tick(1);
  assert(retries.length === 3, "Should retry after 30s");
  
  // Fourth retry after 60s
  timer.tick(59999);
  assert(retries.length === 3, "Should not retry before 60s");
  timer.tick(1);
  assert(retries.length === 4, "Should retry after 60s");
  
  // Fifth retry after 60s (capped)
  timer.tick(59999);
  assert(retries.length === 4, "Should not retry before 60s (capped)");
  timer.tick(1);
  assert(retries.length === 5, "Should retry after 60s (capped)");
  
  // Sixth retry after 60s (capped)
  timer.tick(60000);
  assert(retries.length === 6, "Should retry after 60s (capped)");
  
  scheduler.cleanup();
  console.log("  ✓ Backoff schedule: 0, 15s, 30s, 60s, 60s, 60s");
}

function testTriggerImmediate() {
  console.log("\n▶ Testing trigger immediate...");

  const timer = createFakeTimer();
  const scheduler = createRetryScheduler({ timer });
  
  let retryCount = 0;
  const onRetry = () => {
    retryCount += 1;
  };
  
  scheduler.scheduleRetry(onRetry);
  timer.tick(5000); // 5s
  assert(retryCount === 1, "Should have retried after 5s (past immediate)");
  
  // Schedule next retry (would be after 15s)
  retryCount = 0;
  scheduler.scheduleRetry(onRetry);
  timer.tick(1000); // 1s
  assert(retryCount === 0, "Should not have retried yet");
  
  // Trigger immediate should fire now and reset backoff
  scheduler.triggerImmediate();
  assert(retryCount === 1, "Should have retried immediately");
  assert(timer.pendingCount() === 0, "Should have cleared pending timer");
  
  // Next retry should be immediate again (backoff reset)
  retryCount = 0;
  scheduler.scheduleRetry(onRetry);
  timer.tick(0);
  assert(retryCount === 1, "Should retry immediately (backoff reset)");
  
  scheduler.cleanup();
  console.log("  ✓ Trigger immediate fires callback and resets backoff");
}

function testOnlineEvent() {
  console.log("\n▶ Testing online event listener...");

  const timer = createFakeTimer();
  const listeners = new Map<string, () => void>();
  
  const addEventListener = (type: string, handler: () => void) => {
    listeners.set(type, handler);
  };
  
  const removeEventListener = (type: string) => {
    listeners.delete(type);
  };
  
  const scheduler = createRetryScheduler({
    timer,
    addEventListener,
    removeEventListener,
  });
  
  assert(listeners.has('online'), "Should have registered online listener");
  
  let retryCount = 0;
  const onRetry = () => {
    retryCount += 1;
  };
  
  scheduler.scheduleRetry(onRetry);
  timer.tick(5000); // 5s
  assert(retryCount === 1, "Should have retried");
  
  // Schedule next retry
  retryCount = 0;
  scheduler.scheduleRetry(onRetry);
  timer.tick(1000); // 1s
  assert(retryCount === 0, "Should not have retried yet");
  
  // Fire online event
  const onlineHandler = listeners.get('online');
  assert(onlineHandler !== undefined, "Online handler should exist");
  if (onlineHandler) {
    onlineHandler();
  }
  
  assert(retryCount === 1, "Should have retried immediately on online event");
  assert(timer.pendingCount() === 0, "Should have cleared pending timer");
  
  // Cleanup should remove listener
  scheduler.cleanup();
  assert(!listeners.has('online'), "Should have removed online listener");
  
  console.log("  ✓ Online event triggers immediate retry and cleanup removes listener");
}

function testReset() {
  console.log("\n▶ Testing reset...");

  const timer = createFakeTimer();
  const scheduler = createRetryScheduler({ timer });
  
  let retryCount = 0;
  const onRetry = () => {
    retryCount += 1;
    scheduler.scheduleRetry(onRetry);
  };
  
  scheduler.scheduleRetry(onRetry);
  timer.tick(0);
  assert(retryCount === 1, "First retry immediate");
  
  timer.tick(15000);
  assert(retryCount === 2, "Second retry after 15s");
  
  // Reset should clear pending and reset backoff
  scheduler.reset();
  assert(timer.pendingCount() === 0, "Should have cleared pending timer");
  
  // Next schedule should start from immediate again
  retryCount = 0;
  scheduler.scheduleRetry(onRetry);
  timer.tick(0);
  assert(retryCount === 1, "Should retry immediately after reset");
  
  scheduler.cleanup();
  console.log("  ✓ Reset clears pending and resets backoff");
}

function testCleanup() {
  console.log("\n▶ Testing cleanup...");

  const timer = createFakeTimer();
  const listeners = new Map<string, () => void>();
  
  const addEventListener = (type: string, handler: () => void) => {
    listeners.set(type, handler);
  };
  
  const removeEventListener = (type: string) => {
    listeners.delete(type);
  };
  
  const scheduler = createRetryScheduler({
    timer,
    addEventListener,
    removeEventListener,
  });
  
  let retryCount = 0;
  const onRetry = () => {
    retryCount += 1;
  };
  
  scheduler.scheduleRetry(onRetry);
  assert(timer.pendingCount() === 1, "Should have pending timer");
  assert(listeners.has('online'), "Should have online listener");
  
  scheduler.cleanup();
  
  assert(timer.pendingCount() === 0, "Should have cleared pending timer");
  assert(!listeners.has('online'), "Should have removed online listener");
  
  // Callback should no longer fire
  timer.tick(100000);
  assert(retryCount === 0, "Should not retry after cleanup");
  
  console.log("  ✓ Cleanup clears timers and removes listeners");
}

console.log("Testing Retry Scheduler");
console.log("=======================");

testBackoffSchedule();
testTriggerImmediate();
testOnlineEvent();
testReset();
testCleanup();

console.log("\n✅ All retry scheduler tests passed\n");
