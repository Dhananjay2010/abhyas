/**
 * Session label logic for History display.
 * 
 * Precedence:
 * 1. status='in_progress' + today → "In progress" (even with 0 sets)
 * 2. status='in_progress' + past date → "Unfinished from <date>"
 * 3. status='completed' → "Completed" (never "Skipped" for 0 sets/NULL started_at for yoga/breathing)
 * 4. status='skipped' → "Skipped"
 * 5. status='abandoned' → "Abandoned"
 * 
 * For strength sessions only: completed with 0 working sets shows as "Skipped".
 */

export type SessionStatus = "completed" | "in_progress" | "skipped" | "abandoned";
export type ActualType = "weights" | "bodyweight" | "yoga" | "meditation" | null;

export interface SessionLabelInput {
  status: SessionStatus;
  actualType: ActualType;
  setCount: number;
  localDate: string;
  today: string;
  endedEarly: boolean;
  plannedSets: number | null;
}

export function getSessionLabel(input: SessionLabelInput): string {
  const {
    status,
    actualType,
    setCount,
    localDate,
    today,
    endedEarly,
    plannedSets,
  } = input;

  // Priority 1: in_progress + today → "In progress" (even with 0 sets, per QA)
  if (status === "in_progress" && localDate === today) {
    return "In progress";
  }

  // Priority 2: in_progress + past date → "Unfinished from <date>"
  if (status === "in_progress" && localDate !== today) {
    return `Unfinished from ${formatShortDate(localDate)}`;
  }

  // Priority 3: skipped → "Skipped"
  if (status === "skipped") {
    return "Skipped";
  }

  // Priority 4: abandoned → "Abandoned"
  if (status === "abandoned") {
    return "Abandoned";
  }

  // Priority 5: completed sessions
  // For strength (weights/bodyweight/null), zero sets → "Skipped"
  // For yoga/breathing, zero sets → "Completed" (trust the status)
  const isStrength = actualType === "weights" || actualType === "bodyweight" || actualType === null;
  const isZeroSetStrength = isStrength && setCount === 0;

  if (isZeroSetStrength) {
    return "Skipped";
  }

  if (endedEarly && plannedSets && plannedSets > 0) {
    return `Ended early · ${setCount} of ${plannedSets} ${plannedSets === 1 ? "set" : "sets"}`;
  }

  return "Completed";
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
