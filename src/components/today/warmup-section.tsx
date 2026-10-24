/**
 * Warm-up section for Today page.
 * 
 * Displays the list of today's exercises with heading.
 * Only renders if there are exercises to show.
 */

type Exercise = {
  key: string;
  name: string;
  cue: string | null;
  metric: string | null;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  skipped: boolean;
  swappedIn: boolean;
};

export function WarmupSection({
  todayExercises,
  actual,
  strengthDone,
}: {
  todayExercises: Exercise[];
  actual: unknown[] | null;
  strengthDone: boolean;
}) {
  if (todayExercises.length === 0) {
    return null;
  }

  const heading = !(actual && actual.length > 0)
    ? "Warm-up, then"
    : strengthDone
      ? "What you did"
      : "Where you got to";

  return (
    <section className="mt-7">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
        {heading}
      </h2>
      <ol className="space-y-2">
        {todayExercises.map((row) => (
          <li
            key={row.key}
            className="rounded-xl border border-border bg-surface px-4 py-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {row.swappedIn && <span className="text-accent">✱ </span>}
                  {row.name}
                  {row.skipped && (
                    <span className="ml-2 text-xs text-muted">(skipped)</span>
                  )}
                </p>
                {row.cue && (
                  <p className="mt-1 text-xs text-muted leading-snug">{row.cue}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums text-muted">
                {row.sets} × {row.repsMin === row.repsMax ? row.repsMin : `${row.repsMin}-${row.repsMax}`}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
