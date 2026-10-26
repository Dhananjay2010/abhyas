export interface ReplayConflictNoticeProps {
  conflicts: number;
}

export function ReplayConflictNotice({ conflicts }: ReplayConflictNoticeProps) {
  if (conflicts === 0) {
    return null;
  }

  return (
    <div className="mb-5 rounded-xl border border-muted/30 bg-muted/10 px-4 py-3 text-sm text-muted">
      <p className="font-medium">
        {conflicts === 1
          ? "One set couldn't be saved"
          : `${conflicts} sets couldn't be saved`}
      </p>
      <p className="mt-1">
        {conflicts === 1
          ? "That set was already recorded differently."
          : "Those sets were already recorded differently."}
      </p>
    </div>
  );
}
