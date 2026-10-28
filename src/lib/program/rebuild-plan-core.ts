/**
 * Core logic for rebuilding a user's training block.
 * Extracted from actions.ts to make it testable without 'use server' constraints.
 */

export type ActiveBlock = {
  id: string;
  ends_on: string;
};

export type RebuildPlanDeps = {
  userId: string;
  today: string;
  
  fetchActiveBlock(): PromiseLike<ActiveBlock | null>;
  ensureCurrentBlock(activeBlock: ActiveBlock | null): PromiseLike<
    | { status: "none" }
    | { status: "current"; programId: string }
    | { status: "rolled_over"; programId: string; blockNumber: number }
    | { status: "error"; error: string }
  >;
  createBlock(): PromiseLike<
    | { ok: true; programId: string; blockNumber: number }
    | { ok: false; error: string }
  >;
};

export type RebuildPlanResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Fix pd-b: Run rollover BEFORE rebuild to close ended blocks as 'completed'
 * instead of 'superseded'. This matches the flow that Today and Start use.
 */
export async function rebuildPlanCore(
  deps: RebuildPlanDeps
): Promise<RebuildPlanResult> {
  const activeBlock = await deps.fetchActiveBlock();
  
  const rollover = await deps.ensureCurrentBlock(activeBlock);
  if (rollover.status === "error") {
    return { ok: false, error: rollover.error };
  }
  
  const result = await deps.createBlock();
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  
  return { ok: true };
}
