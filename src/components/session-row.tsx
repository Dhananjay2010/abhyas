import Link from "next/link";
import { formatVolume, getUnitsPreference, type UnitsPreference } from "@/lib/units";

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

export function SessionRow({ s, today, units = "metric" }: { s: SessionSummary; today: string; units?: UnitsPreference }) {
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
        minutes !== null ? `${minutes === 1 ? "1 min" : `${minutes} min`}` : null,
        s.setCount > 0 ? `${s.setCount} ${s.setCount === 1 ? "set" : "sets"}` : null,
        s.volumeKg > 0 ? formatVolume(s.volumeKg, units) : null,
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
