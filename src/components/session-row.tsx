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
