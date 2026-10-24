import Link from "next/link";
import { clockLabel } from "@/components/session-row";
import { GUIDANCE_OPTIONS, moodLabel } from "@/lib/breathing/pattern";
import { branding } from "@/lib/branding";
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
  /** Set when this log was one step of a routine. */
  routine_name: string | null;
  routine_step: number | null;
};

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Tones", "Ocean", "Voice", "Off" -- read from the same list the player offers. */
const guidanceLabel = (v: string) => GUIDANCE_OPTIONS.find((g) => g.value === v)?.label ?? null;

/**
 * A breathing practice in History. It has no exercises or sets, so it gets a
 * page of its own instead of a workout page reading "Sets 0 · Volume —".
 *
 * A routine arrives as several logs, one per step. They are shown as the steps
 * they were, with the totals above them, so the entry reads as the one thing
 * it was rather than as three separate practices.
 */
export function BreathingDetail({
  name,
  slug,
  isRoutine = false,
  localDate,
  seconds,
  logs,
}: {
  name: string;
  /** For "Practise again"; null when the pattern no longer exists, or for a routine. */
  slug: string | null;
  isRoutine?: boolean;
  localDate: string;
  seconds: number | null;
  /** Empty for a practice recorded before breathing_logs existed. */
  logs: BreathingLog[];
}) {
  const first = logs[0] ?? null;
  // Both check-ins of a routine sit on its first step, so they are read from
  // there rather than from whichever step happened to be rated.
  const before = moodLabel(first?.mood_before);
  const after = moodLabel(first?.mood_after);
  const breaths = logs.reduce((n, l) => n + l.breaths, 0);
  const sound = first ? guidanceLabel(first.guidance) : null;
  const endedEarly = logs.find((l) => l.ended_early) ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-16">
      <Link href="/history" className="text-sm text-muted underline underline-offset-2">
        ← History
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">{name}</h1>
      <p className="mt-1 text-sm text-muted">
        {longDate(localDate)} · {isRoutine ? "Breathing routine" : "Breathing"}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="Time" value={seconds ? clockLabel(seconds) : "—"} />
        <Stat label="Breaths" value={logs.length > 0 ? `${breaths}` : "—"} />
        <Stat label="Sound" value={sound ?? "—"} />
      </dl>

      {isRoutine && logs.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            {logs.length} {logs.length === 1 ? "step" : "steps"}
          </h2>
          <ol className="mt-3 space-y-2">
            {logs.map((log, i) => (
              <li
                key={`${log.pattern_name}-${log.routine_step ?? i}`}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  <span className="text-muted tabular-nums">{log.routine_step ?? i + 1}. </span>
                  {log.pattern_name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {clockLabel(log.seconds)} · {log.breaths} {log.breaths === 1 ? "breath" : "breaths"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {endedEarly && (
        <p className="mt-4 text-sm text-muted">
          {isRoutine ? `${endedEarly.pattern_name} ended early` : "Ended early"}, after{" "}
          {endedEarly.cycles_completed} of {endedEarly.planned_cycles} rounds.
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

      {logs.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Recorded before {branding.name} kept the details of each practice.
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
