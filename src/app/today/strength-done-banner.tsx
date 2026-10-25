/**
 * Banner component for completed strength sessions on the Today page.
 * 
 * Shows either "Session complete. Well done." (success styling) or
 * "Session ended early. X of Y sets." (neutral styling).
 */

export function StrengthDoneBanner({
  endedEarly,
  workingSets,
  plannedSets,
}: {
  endedEarly: boolean;
  workingSets: number;
  plannedSets: number;
}) {
  if (endedEarly) {
    return (
      <p className="rounded-xl border border-border bg-surface-2 px-5 py-4 text-center text-sm text-muted">
        Session ended early.
        {plannedSets > 0 && ` ${workingSets} of ${plannedSets} sets.`}
      </p>
    );
  }
  
  return (
    <p className="rounded-xl border border-success/30 bg-success/10 px-5 py-4 text-center text-sm text-success">
      Session complete. Well done.
    </p>
  );
}
