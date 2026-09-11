import Link from "next/link";
import { clockLabel } from "@/components/session-row";
import { moodLabel } from "@/lib/breathing/pattern";
import { Stat } from "./stat";

export type BreathingLog = {
  pattern_name: string;
  cycles_completed: number;
  planned_cycles: number;
  breaths: number;
  seconds: number;
  ended_early: boolean;
  mood_before: number | null;
  mood_after: number | null;
  guidance: string;
};

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * A breathing practice in History. It has no exercises or sets, so it gets a
 * page of its own instead of a workout page reading "Sets 0 · Volume —".
 */
export function BreathingDetail({
  name,
  slug,
  localDate,
  seconds,
  log,
}: {
  name: string;
  /** For "Practise again"; null when the pattern no longer exists. */
  slug: string | null;
  localDate: string;
  seconds: number | null;
  /** Null for a practice recorded before breathing_logs existed. */
  log: BreathingLog | null;
}) {
  const before = moodLabel(log?.mood_before);
  const after = moodLabel(log?.mood_after);
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-16">
      <Link href="/history" className="text-sm text-muted underline underline-offset-2">
        ← History
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{name}</h1>
      <p className="mt-1 text-sm text-muted">{longDate(localDate)} · Breathing</p>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="Time" value={seconds ? clockLabel(seconds) : "—"} />
        <Stat label="Breaths" value={log ? `${log.breaths}` : "—"} />
        <Stat
          label="Sound"
          value={log?.guidance === "tones" ? "Tones" : log?.guidance === "off" ? "Off" : "—"}
        />
      </dl>

      {log?.ended_early && (
        <p className="mt-4 text-sm text-muted">
          Ended early, after {log.cycles_completed} of {log.planned_cycles} rounds.
        </p>
      )}

      {(before || after) && (
        <section className="mt-6 rounded-xl border border-border bg-surface px-4 py-3.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">How you felt</h2>
          <p className="mt-2 text-sm">
            {before && after ? `${before} → ${after}` : after ? `Afterwards: ${after}` : `Before: ${before}`}
          </p>
        </section>
      )}

      {!log && (
        <p className="mt-6 text-sm text-muted">
          Recorded before Abhyas kept the details of each practice.
        </p>
      )}

      {slug && (
        <Link
          href={`/breathe/${slug}`}
          className="mt-8 block rounded-xl bg-accent px-6 py-4 text-center font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Practise again
        </Link>
      )}
    </main>
  );
}
