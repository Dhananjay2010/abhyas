/**
 * Pure helpers for Today page row mapping and display logic.
 */

import { exerciseCompletion } from "../session/completion";

export type SessionStatus = "in_progress" | "completed" | "skipped";

export type CompletionDisplay = {
  label: string;
  strikethrough: boolean;
};

/**
 * Count working sets (non-warmup sets) from a list of sets.
 */
export function countWorkingSets(sets: Array<{ is_warmup_set: boolean }>): number {
  return sets.filter((s) => !s.is_warmup_set).length;
}

/**
 * Check if completion labels should be shown for a session.
 * Only ended sessions show completion labels.
 */
export function shouldShowCompletionLabels(status: SessionStatus): boolean {
  return status !== "in_progress";
}

/**
 * Get the completion display (label and strikethrough) for an exercise.
 * Returns empty label for in-progress sessions.
 */
export function getCompletionDisplay(
  sessionStatus: SessionStatus,
  workingSetsLogged: number,
  plannedSets: number,
): CompletionDisplay {
  const sessionEnded = shouldShowCompletionLabels(sessionStatus);

  if (!sessionEnded) {
    return { label: "", strikethrough: false };
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
