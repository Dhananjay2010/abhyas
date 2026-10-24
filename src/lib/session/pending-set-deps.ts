/**
 * Dependencies for pending set retry system.
 * 
 * Plain functions that can be swapped with fakes in tests.
 */

import { nowMs } from "@/lib/dates";

export type PendingSetDeps = {
  now: () => number;
};

export function createPendingSetDeps(): PendingSetDeps {
  return {
    now: nowMs,
  };
}
