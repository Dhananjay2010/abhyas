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

/**
 * Exercise completion status helper.
 *
 * Determines whether an exercise is done, partial, or skipped based on the
 * number of working sets logged vs planned. Partial means 1+ working sets
 * logged but fewer than planned. Skipped means 0 working sets.
 *
 * Pure function that derives completion from set counts with no schema changes.
 * Exported for use by History, Progress, and other screens that need to show
 * exercise completion state.
 */

export type ExerciseCompletionKind = "done" | "partial" | "skipped";

export type ExerciseCompletion = {
  kind: ExerciseCompletionKind;
  label: string;
  strikethrough: boolean;
};

export function exerciseCompletion(params: {
  workingSetsLogged: number;
  plannedSets: number;
}): ExerciseCompletion {
  const { workingSetsLogged, plannedSets } = params;

  const clampedLogged = Math.max(0, workingSetsLogged);
  const clampedPlanned = Math.max(0, plannedSets);

  if (clampedLogged === 0) {
    return {
      kind: "skipped",
      label: "Skipped",
      strikethrough: true,
    };
  }

  if (clampedLogged >= clampedPlanned) {
    return {
      kind: "done",
      label: "",
      strikethrough: false,
    };
  }

  return {
    kind: "partial",
    label: `Partly done · ${clampedLogged} of ${clampedPlanned} sets`,
    strikethrough: false,
  };
}
