/**
 * Dependencies for pending set retry system.
 * 
 * Plain functions that can be swapped with fakes in tests.
 */

export type PendingSetDeps = {
  now: () => number;
};

export function createPendingSetDeps(now: () => number = Date.now): PendingSetDeps {
  return {
    now,
  };
}
