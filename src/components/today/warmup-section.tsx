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
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  skipped: boolean;
  swappedIn: boolean;
};

export function WarmupSection({
  todayExercises,
  actual,
  strengthDone,
  isDeload,
  isTraining,
}: {
  todayExercises: Exercise[];
  actual: unknown[] | null;
  strengthDone: boolean;
  isDeload: boolean;
  isTraining: boolean;
}) {

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
              <span className={`font-semibold ${row.skipped ? "text-muted line-through" : ""}`}>
                {row.name}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-accent">
                {row.sets} × {row.repsMin}–{row.repsMax}
                {row.metric === "seconds" ? "s" : ""}
              </span>
            </div>
            {(row.swappedIn || row.skipped || (isDeload && isTraining && !row.skipped && !(actual && actual.length > 0))) && (
              <p className="mt-1 text-xs font-medium text-muted uppercase tracking-wider">
                {row.skipped ? "Skipped" : row.swappedIn ? "Swapped in" : "Deload"}
              </p>
            )}
            {row.cue && <p className="mt-1 text-sm text-muted">{row.cue}</p>}
            <p className="mt-1 text-xs text-muted">{row.restSeconds}s rest</p>
          </li>
        ))}
      </ol>
      {!(actual && actual.length > 0) && (
        <p className="mt-4 text-center text-xs text-muted">
          Warm-up is built from today&apos;s muscles and any joint you flagged.
        </p>
      )}
    </section>
  );
}
