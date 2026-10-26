/**
 * Auto-retry scheduler for pending sets with exponential backoff.
 * 
 * Schedule: 0, 15, 30, 60s, then every 60s (capped).
 * Triggers:
 * - Automatic backoff after failures
 * - Window online event
 * - Focus and visibility change (already handled)
 * 
 * The timer is injected for deterministic testing.
 */

export type RetryTimer = {
  setTimeout: (callback: () => void, ms: number) => number | NodeJS.Timeout;
  clearTimeout: (id: number | NodeJS.Timeout) => void;
};

const BACKOFF_SCHEDULE_MS = [0, 15000, 30000, 60000];
const CAPPED_INTERVAL_MS = 60000;

export type RetryScheduler = {
  scheduleRetry(onRetry: () => void): void;
  triggerImmediate(): void;
  reset(): void;
  cleanup(): void;
};

export function createRetryScheduler(config: {
  timer: RetryTimer;
  addEventListener?: (type: string, handler: () => void) => void;
  removeEventListener?: (type: string, handler: () => void) => void;
}): RetryScheduler {
  const { timer, addEventListener, removeEventListener } = config;
  
  let attemptCount = 0;
  let timeoutId: number | NodeJS.Timeout | null = null;
  let currentCallback: (() => void) | null = null;
  let onlineHandler: (() => void) | null = null;

  function getBackoffMs(): number {
    if (attemptCount < BACKOFF_SCHEDULE_MS.length) {
      return BACKOFF_SCHEDULE_MS[attemptCount];
    }
    return CAPPED_INTERVAL_MS;
  }

  function scheduleRetry(onRetry: () => void): void {
    if (timeoutId !== null) {
      timer.clearTimeout(timeoutId);
    }
    
    currentCallback = onRetry;
    const delayMs = getBackoffMs();
    attemptCount += 1;
    
    timeoutId = timer.setTimeout(() => {
      timeoutId = null;
      if (currentCallback) {
        currentCallback();
      }
    }, delayMs);
  }

  function triggerImmediate(): void {
    if (timeoutId !== null) {
      timer.clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    attemptCount = 0;
    
    if (currentCallback) {
      currentCallback();
    }
  }

  function reset(): void {
    attemptCount = 0;
    if (timeoutId !== null) {
      timer.clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function cleanup(): void {
    reset();
    currentCallback = null;
    
    if (onlineHandler && removeEventListener) {
      removeEventListener('online', onlineHandler);
      onlineHandler = null;
    }
  }

  if (addEventListener && removeEventListener) {
    onlineHandler = () => {
      triggerImmediate();
    };
    addEventListener('online', onlineHandler);
  }

  return {
    scheduleRetry,
    triggerImmediate,
    reset,
    cleanup,
  };
}
