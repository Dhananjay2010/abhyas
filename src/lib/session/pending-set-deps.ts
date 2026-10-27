/**
 * Dependencies for pending set retry system.
 * 
 * Plain functions that can be swapped with fakes in tests.
 */

export type PendingSetDeps = {
  now: () => number;
};

export function createPendingSetDeps(now?: Date | (() => number)): PendingSetDeps {
  if (typeof now === 'function') {
    return { now };
  }
  if (now instanceof Date) {
    const timestamp = now.getTime();
    return { now: () => timestamp };
  }
  return { now: Date.now };
}
