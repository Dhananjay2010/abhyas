/**
 * Today's "Your week" list.
 *
 * Extracted from page.tsx so the done tick and the "your choice" override can
 * be rendered and asserted in a test (scripts/test-week-list.tsx) instead of
 * grepped for. The rows come from buildWeekDays, which decides isDone.
 */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type WeekListDay = {
  day_index: number;
  day_type: string;
  label: string | null;
  isToday: boolean;
  isDone: boolean;
};

export function WeekList({
  days,
  chosenByDayIndex,
}: {
  days: WeekListDay[];
  chosenByDayIndex: Map<number, string>;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
      {days.map((d) => {
        const chosen = chosenByDayIndex.get(d.day_index);
        return (
          <li
            key={d.day_index}
            data-day-index={d.day_index}
            data-done={d.isDone ? "true" : "false"}
            className={`flex justify-between gap-4 px-4 py-3 ${d.isToday ? "bg-surface-2" : ""}`}
          >
            <span className={`flex items-center gap-2 ${d.isToday ? "font-semibold" : "text-muted"}`}>
              {DAY_NAMES[d.day_index - 1]}
              {d.isDone && (
                <svg
                  role="img"
                  aria-label="Done"
                  className="h-4 w-4 text-success"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            {chosen ? (
              <span className="text-right">
                <span className="font-medium text-accent">{chosen}</span>
                <span className="block text-xs text-muted">your choice</span>
              </span>
            ) : (
              <span className={d.day_type === "rest" ? "text-muted" : "font-medium"}>{d.label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
