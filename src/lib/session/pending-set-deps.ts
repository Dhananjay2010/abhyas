/**
 * Dependencies for pending set retry system.
 * 
 * Plain functions that can be swapped with fakes in tests.
 */

export type PendingSetDeps = {
  now: () => number;
};

export function createPendingSetDeps(): PendingSetDeps {
  return {
    now: () => Date.now(),
  };
}
