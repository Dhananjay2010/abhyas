/**
 * Session completion status helper.
 *
 * Determines whether a session is complete or partial based on logged vs planned
 * sets, and provides a human-readable label for display.
 *
 * Used in the session summary and can be called by History, Today, or any other
 * screen that needs to show completion status.
 */

export type CompletionKind = "complete" | "partial";

export type SessionCompletion = {
  kind: CompletionKind;
  label: string;
};

export function sessionCompletion(params: {
  loggedSets: number;
  plannedSets: number;
  endedEarly: boolean;
}): SessionCompletion {
  const { loggedSets, plannedSets, endedEarly } = params;
  
  const clampedLogged = Math.max(0, loggedSets);
  const clampedPlanned = Math.max(0, plannedSets);

  if (!endedEarly && clampedLogged >= clampedPlanned) {
    return {
      kind: "complete",
      label: "Complete",
    };
  }

  if (endedEarly) {
    return {
      kind: "partial",
      label: `Ended early · ${clampedLogged}/${clampedPlanned} sets`,
    };
  }

  if (clampedLogged < clampedPlanned) {
    return {
      kind: "partial",
      label: `${clampedLogged}/${clampedPlanned} sets`,
    };
  }

  return {
    kind: "complete",
    label: "Complete",
  };
}

export type ExerciseStatus = "pending" | "completed" | "skipped";

/**
 * Determine if a session was ended early based on its status and exercise statuses.
 *
 * A session is considered ended early when:
 * - The session status is "completed"
 * - At least one exercise is still "pending"
 *
 * abandonSession leaves remaining exercises as "pending", while a normal finish
 * completes or skips all exercises before finishing.
 */
export function endedEarlyFromRows(
  sessionStatus: string,
  exerciseStatuses: ExerciseStatus[],
): boolean {
  if (sessionStatus !== "completed") {
    return false;
  }

  return exerciseStatuses.some((status) => status === "pending");
}
