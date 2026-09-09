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
 * screen.
 */
export function sessionLabel(dayLabel: string | null, actualType: string | null): string {
  if (actualType === "yoga" || actualType === "meditation") {
    return TYPE_LABEL[actualType];
  }
  return dayLabel ?? TYPE_LABEL[actualType ?? ""] ?? "Session";
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function SessionRow({ s, today }: { s: SessionSummary; today: string }) {
  const minutes = s.durationSeconds ? Math.round(s.durationSeconds / 60) : null;
  const details = [
    STATUS_LABEL[s.status] ?? s.status,
    s.isDeload ? "deload" : null,
    minutes !== null ? `${minutes} min` : null,
    s.setCount > 0 ? `${s.setCount} sets` : null,
    s.volumeKg > 0 ? `${Math.round(s.volumeKg)} kg` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/history/${s.id}`}
      className="block rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-muted/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{s.label}</span>
        <span className="shrink-0 text-xs text-muted">
          {s.localDate === today ? "Today" : longDate(s.localDate)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{details.join(" · ")}</p>
    </Link>
  );
}
