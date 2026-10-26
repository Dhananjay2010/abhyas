import Link from "next/link";

export type SessionSummary = {
  id: string;
  localDate: string;
  label: string;
  status: string;
  isDeload: boolean;
  durationSeconds: number | null;
  setCount: number;
  volumeKg: number;
  /**
   * Present for a breathing practice, which is described by its breaths, not
   * its sets. `pumps` is set for a pumping practice (Kapalabhati), which counts
   * pumps rather than breaths -- the same word its own round and ending use.
   */
  breathing?: { breaths: number | null; pumps?: boolean } | null;
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "Unfinished",
  planned: "Not started",
  skipped: "Skipped",
  rest: "Rest",
};

const TYPE_LABEL: Record<string, string> = {
  weights: "Workout",
  bodyweight: "Workout",
  yoga: "Yoga",
  meditation: "Breathing",
  rest: "Rest",
  active_recovery: "Active recovery",
};

/**
 * What to call a session in a list.
 *
 * The program day's label ("Push", "Legs") is only right when the session was
 * actually that kind of training. A yoga session recorded on a Legs day must
 * not be listed as "Legs", and the raw enum "meditation" must never reach the
 * screen. A breathing practice is named for what it was ("Box Breathing"),
 * falling back to "Breathing" for one recorded before the pattern was kept.
 */
export function sessionLabel(
  dayLabel: string | null,
  actualType: string | null,
  patternName?: string | null,
): string {
  if (actualType === "meditation") return patternName ?? TYPE_LABEL.meditation;
  if (actualType === "yoga") return TYPE_LABEL.yoga;
  return dayLabel ?? TYPE_LABEL[actualType ?? ""] ?? "Session";
}

/** m:ss. A breathing practice is often under a minute, which "0 min" would hide. */
export function clockLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "20 pumps", "1 breath". Kapalabhati is counted in the word it paces you in. */
const breathCount = (n: number, pumps?: boolean) =>
  `${n} ${pumps ? (n === 1 ? "pump" : "pumps") : n === 1 ? "breath" : "breaths"}`;

export function SessionRow({ s, today }: { s: SessionSummary; today: string }) {
  const minutes = s.durationSeconds ? Math.round(s.durationSeconds / 60) : null;
  const details = s.breathing
    ? [
        "Breathing",
        s.durationSeconds ? clockLabel(s.durationSeconds) : null,
        s.breathing.breaths ? breathCount(s.breathing.breaths, s.breathing.pumps) : null,
      ].filter(Boolean)
    : [
        STATUS_LABEL[s.status] ?? s.status,
        s.isDeload ? "deload" : null,
        minutes !== null ? `${minutes} min` : null,
        s.setCount > 0 ? `${s.setCount} sets` : null,
        s.volumeKg > 0 ? `${Math.round(s.volumeKg)} kg` : null,
      ].filter(Boolean);

  const isInProgress = s.status === "in_progress";

  return (
    <div className="relative rounded-xl border border-border bg-surface transition-colors hover:border-muted/50">
      <Link
        href={`/history/${s.id}`}
        className="block px-4 py-3.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{s.label}</span>
          <span className="shrink-0 text-xs text-muted">
            {s.localDate === today ? "Today" : longDate(s.localDate)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">{details.join(" · ")}</p>
      </Link>
      {isInProgress && (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href={`/session/${s.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Resume
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}
