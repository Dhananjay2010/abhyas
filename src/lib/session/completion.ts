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

  if (!endedEarly && loggedSets >= plannedSets) {
    return {
      kind: "complete",
      label: "Complete",
    };
  }

  if (endedEarly) {
    return {
      kind: "partial",
      label: `Ended early · ${loggedSets}/${plannedSets} sets`,
    };
  }

  if (loggedSets < plannedSets) {
    return {
      kind: "partial",
      label: `${loggedSets}/${plannedSets} sets`,
    };
  }

  return {
    kind: "complete",
    label: "Complete",
  };
}
