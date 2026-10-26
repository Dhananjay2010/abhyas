import type { PendingSetState } from "@/lib/session/pending-set-controller";
import type { RunnerStatusAreaProps } from "@/components/runner-status-area";

/**
 * Selector: maps pending set controller state to RunnerStatusArea props.
 * 
 * Pure function for testability.
 */
export function selectRunnerStatusProps(state: PendingSetState): RunnerStatusAreaProps {
  return {
    pendingCount: state.pending.length,
    replayState: state,
  };
}
