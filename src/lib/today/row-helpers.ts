/**
 * Pure helpers for Today page row mapping and display logic.
 */

import { exerciseCompletion } from "../session/completion";
import { countWorkingSets as countWorkingSetsCore } from "../session/count-sets";
import type { SetForCounting } from "../session/count-sets";

export type SessionStatus = "in_progress" | "completed" | "skipped";

export type CompletionDisplay = {
  label: string;
  strikethrough: boolean;
};

/**
 * Count working sets (non-warmup sets with logged data) from a list of sets.
 * Uses the core implementation from count-sets.ts.
 */
export function countWorkingSets(sets: Array<SetForCounting>): number {
  return countWorkingSetsCore(sets);
}

/**
 * Get the completion display (label and strikethrough) for an exercise.
 * Returns empty label for in-progress sessions.
 * 
 * Handles the "Swapped in" case: if an exercise was swapped in, has 0 sets logged,
 * and the session ended, show "Swapped in" with no strikethrough.
 */
export function getCompletionDisplay(
  sessionStatus: SessionStatus,
  workingSetsLogged: number,
  plannedSets: number,
  isSwappedIn = false,
): CompletionDisplay {
  // Only ended sessions show completion labels
  const sessionEnded = sessionStatus !== "in_progress";

  if (!sessionEnded) {
    return { label: "", strikethrough: false };
  }

  // Swapped-in exercise with 0 sets on ended session shows "Swapped in"
  if (isSwappedIn && workingSetsLogged === 0) {
    return { label: "Swapped in", strikethrough: false };
  }

  const completion = exerciseCompletion(workingSetsLogged, plannedSets);

  if (completion === "skipped") {
    return { label: "Skipped", strikethrough: true };
  }

  if (completion === "partial") {
    return {
      label: `Partly done · ${workingSetsLogged} of ${plannedSets} sets`,
      strikethrough: false,
    };
  }

  return { label: "", strikethrough: false };
}
