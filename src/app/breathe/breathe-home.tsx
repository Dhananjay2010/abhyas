"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { unlockBreathAudio } from "@/lib/breathing/audio";
import { noteInAppStart } from "@/lib/breathing/client";
import { buildCycle, initialCycles, lengthLabel } from "@/lib/breathing/engine";
import {
  INTENTS,
  sessionSearch,
  type BreathingPrefs,
  type Intent,
  type Pattern,
} from "@/lib/breathing/pattern";
import { dayLine, journeyHref, type ResolvedJourney } from "@/lib/breathing/journey";
import {
  routineHref,
  routineLength,
  stepNames,
  type ResolvedRoutine,
} from "@/lib/breathing/routine";
import { warmUpSpeech } from "@/lib/breathing/speech";
import type { BreathingStats, CalmShift } from "@/lib/breathing/stats";
import type { Suggestion } from "@/lib/breathing/suggest";
import { CARD_BG } from "@/lib/breathing/theme";
import { MOODS } from "@/lib/breathing/pattern";
import { formatWeekDuration } from "@/lib/format-duration";
import { updateBreathingPrefs } from "./actions";
import { Icon, WeekStrip } from "./controls";
import { PrefsSheet } from "./prefs-sheet";
import { RhythmPreview } from "./rhythm-preview";

type Actions = { updateBreathingPrefs: typeof updateBreathingPrefs };
const REAL: Actions = { updateBreathingPrefs };

export type LastPractice = { patternId: string; cycles: number };

/** Where someone with no history is pointed: the practice with the clearest evidence behind it. */
const STARTER_SLUG = "physiological-sigh";

const intentLabel = (i: Intent) => INTENTS.find((x) => x.value === i)?.label ?? i;

/** The length a practice would start at for this user, as the setup screen will offer it. */
function lengthFor(p: Pattern, prefs: BreathingPrefs, lastCycles: number | null) {
  const cycle = buildCycle(p.phases);
  const cycles = initialCycles({
    cycle,
    maxCycles: p.maxCycles,
    defaultCycles: p.defaultCycles,
    preferredMinutes: prefs.defaultMinutes,
    lastCycles,
  });
  return { cycles, label: lengthLabel(cycle, cycles, p.maxCycles) };
}

function weekLine(stats: BreathingStats): string {
  const week = formatWeekDuration(stats.weekSeconds);
  return stats.streak >= 2 ? `${week} · ${stats.streak}-day streak` : week;
}

/**
 * The Breathe tab.
 *
 * Built so the most common visit -- "I need to calm down now" -- is one tap:
 * the last practice, at its last length, starts straight from the card at the
 * top. Everything else is a filter by what you want and a list of practices
 * that each breathe their own rhythm.
 */
export function BreatheHome({
  patterns,
  routines = [],
  journeys = [],
  prefs: initialPrefs,
  stats,
  lastCyclesByPattern,
  last,
  suggestion,
  shifts,
  intent: initialIntent,
  todayIndex,
  basePath = "/breathe",
  actions = REAL,
}: {
  patterns: Pattern[];
  /** Sequences of practices, already resolved against this person's timings. */
  routines?: ResolvedRoutine[];
  /** Courses, already resolved against this person's timings and progress. */
  journeys?: ResolvedJourney[];
  prefs: BreathingPrefs;
  stats: BreathingStats;
  lastCyclesByPattern: Record<string, number>;
  last: LastPractice | null;
  /** One practice for right now, and why. */
  suggestion: Suggestion | null;
  /** How each practice leaves you, once you have rated a few. */
  shifts: CalmShift[];
  intent: Intent | null;
  todayIndex: number;
  basePath?: string;
  actions?: Actions;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [intent, setIntent] = useState<Intent | null>(initialIntent);
  const [showPrefs, setShowPrefs] = useState(false);
  const closePrefs = useCallback(() => setShowPrefs(false), []);

  const available = INTENTS.filter(
    (i) =>
      patterns.some((p) => p.intents.includes(i.value)) ||
      routines.some((r) => r.routine.intents.includes(i.value)),
  );
  const shown = intent ? patterns.filter((p) => p.intents.includes(intent)) : patterns;
  const shownRoutines = intent
    ? routines.filter((r) => r.routine.intents.includes(intent))
    : routines;
  const again = last ? patterns.find((p) => p.id === last.patternId) : undefined;
  const againLength = again && last ? lengthFor(again, prefs, last.cycles) : null;
  const starter = patterns.find((p) => p.slug === STARTER_SLUG);

  const chooseIntent = (next: Intent | null) => {
    setIntent(next);
    // Kept in the URL, so coming back from a practice restores the filter.
    window.history.replaceState(null, "", next ? `${basePath}?intent=${next}` : basePath);
  };

  const unlockOnAgainTap = () => {
    // This tap is the gesture that lets the practice screen make sound. iOS
    // grants Web Audio and speech separately, and both only from a gesture.
    if (prefs.guidance !== "off") {
      unlockBreathAudio();
      if (prefs.guidance === "voice") warmUpSpeech(prefs.voiceLang);
    }
    noteInAppStart();
  };

  return (
    <>
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Breathe</h1>
            <p className="mt-2 text-sm text-muted">{weekLine(stats)}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPrefs(true)}
            aria-label="Breathing preferences"
            className="-mr-2 mt-0.5 rounded-xl p-2.5 text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <Icon.Sliders />
          </button>
        </div>
      </header>

      <WeekStrip days={stats.weekDays} todayIndex={todayIndex} className="mt-6" />

      {again && againLength ? (
        <Link
          href={`${basePath}/${again.slug}/session${sessionSearch({
            cycles: againLength.cycles,
            guidance: prefs.guidance,
            ambience: prefs.ambience,
            ambienceVolume: prefs.ambienceVolume,
            voiceLang: prefs.voiceLang,
            showCount: prefs.showCount,
            vibrate: prefs.vibrate,
            settleIn: prefs.settleIn,
            checkIn: prefs.checkIn,
          })}`}
          onClick={unlockOnAgainTap}
          className="mt-7 flex w-full items-center gap-4 rounded-2xl border border-breath/25 px-5 py-4 text-left transition-colors hover:border-breath/50"
          style={{ background: CARD_BG }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-breath uppercase">Again</p>
            <p className="mt-1 truncate text-lg font-semibold">{again.name}</p>
            <p className="text-sm text-breath-ink/70">{againLength.label} · starts right away</p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
            <Icon.Play />
          </span>
        </Link>
      ) : null}

      {suggestion ? (
        <Link
          href={`${basePath}/${suggestion.pattern.slug}`}
          className={`flex items-center gap-4 rounded-2xl border border-breath/25 px-5 py-4 transition-colors hover:border-breath/50 ${
            again ? "mt-3" : "mt-7"
          }`}
          style={{ background: CARD_BG }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-breath uppercase">
              For right now
            </p>
            <p className="mt-1 text-lg font-semibold">{suggestion.pattern.name}</p>
            <p className="text-sm leading-relaxed text-breath-ink/70">{suggestion.reason}</p>
          </div>
          <RhythmPreview phases={suggestion.pattern.phases} shape={suggestion.pattern.shape} size={48} />
        </Link>
      ) : !again && starter ? (
        <Link
          href={`${basePath}/${starter.slug}`}
          className="mt-7 flex items-center gap-4 rounded-2xl border border-breath/25 px-5 py-4 transition-colors hover:border-breath/50"
          style={{ background: CARD_BG }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-breath uppercase">
              New here? Start with this
            </p>
            <p className="mt-1 text-lg font-semibold">{starter.name}</p>
            <p className="text-sm leading-relaxed text-breath-ink/70">
              Five minutes a day. In a 2023 trial it lifted mood more than meditation did.
            </p>
          </div>
          <RhythmPreview phases={starter.phases} shape={starter.shape} size={48} />
        </Link>
      ) : null}

      {available.length > 1 && (
        <div className="-mx-6 mt-8 overflow-x-auto px-6 [scrollbar-width:none]">
          <div role="group" aria-label="What do you want?" className="flex w-max gap-2">
            {[{ value: null, label: "All" } as const, ...available].map((i) => {
              const on = intent === i.value;
              return (
                <button
                  key={i.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseIntent(i.value)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    on ? "border-breath bg-breath/15 text-breath" : "border-border text-muted hover:text-fg"
                  }`}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* A course is not about an intent, so it steps aside while the list is
          being filtered by one rather than sitting there ignoring the filter. */}
      {!intent && journeys.length > 0 && (
        <section className="mt-7">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Course</h2>
          <ul className="mt-3 space-y-2">
            {journeys.map(({ journey, days, progress, today }) => (
              <li key={journey.id}>
                <Link
                  href={journeyHref(journey.slug, basePath)}
                  className={`block rounded-2xl border px-5 py-4 transition-colors ${
                    today ? "border-breath/50 hover:border-breath" : "border-breath/20 hover:border-breath/50"
                  }`}
                  style={{ background: CARD_BG }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-lg font-semibold">{journey.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-breath-ink/60">
                      {dayLine(progress.daysCompleted, days.length)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-breath-ink/70">
                    {today
                      ? `Day ${today.number}: ${today.day.title}`
                      : progress.completed
                        ? "Finished. Every practice in it is still here."
                        : `Day ${progress.daysCompleted + 1} opens tomorrow.`}
                  </p>
                  {/* One mark a day: where you are, before a word is read. */}
                  <div aria-hidden="true" className="mt-3 flex gap-1">
                    {days.map((d) => (
                      <span
                        key={d.number}
                        className={`h-1 flex-1 rounded-full ${
                          d.state === "done"
                            ? "bg-breath"
                            : d.state === "today"
                              ? "bg-breath/40"
                              : "bg-breath-ink/15"
                        }`}
                      />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shownRoutines.length > 0 && (
        <section className="mt-7">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Routines</h2>
          <p className="mt-1 text-sm text-muted">
            Several practices in a row, without having to choose between them.
          </p>
          <ul className="mt-3 space-y-2">
            {shownRoutines.map(({ routine, steps, seconds }) => (
              <li key={routine.id}>
                <Link
                  href={routineHref(routine.slug, basePath)}
                  className="block rounded-2xl border border-breath/20 px-5 py-4 transition-colors hover:border-breath/50"
                  style={{ background: CARD_BG }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-lg font-semibold">{routine.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-breath-ink/60">
                      {routineLength(seconds)}
                    </span>
                  </div>
                  {routine.subtitle && (
                    <p className="mt-0.5 text-sm text-breath-ink/70">{routine.subtitle}</p>
                  )}
                  <p className="mt-2 truncate text-xs text-breath">{stepNames(steps)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The list only needs naming once something else is above it. */}
      {(shownRoutines.length > 0 || (!intent && journeys.length > 0)) && (
        <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted uppercase">Practices</h2>
      )}

      <ul className="mt-4 space-y-2">
        {shown.map((p) => {
          const len = lengthFor(p, prefs, lastCyclesByPattern[p.id] ?? null);
          return (
            <li key={p.id}>
              <Link
                href={`${basePath}/${p.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-breath/40"
              >
                <RhythmPreview phases={p.phases} shape={p.shape} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{len.label}</span>
                  </div>
                  {p.subtitle && <p className="mt-0.5 text-sm text-muted">{p.subtitle}</p>}
                  <p className="mt-1 text-xs text-breath">
                    {[
                      p.kind === "mine" ? "Yours" : null,
                      p.adjusted ? "Your timings" : null,
                      ...p.intents.map(intentLabel),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href={`${basePath}/new`}
        className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm font-medium text-muted transition-colors hover:border-breath/40 hover:text-fg"
      >
        + Create your own
      </Link>

      {shifts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            What works for you
          </h2>
          <ul className="mt-3 space-y-2">
            {shifts.slice(0, 3).map((s) => (
              <li
                key={s.patternName}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">{s.patternName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {MOODS.find((m) => m.value === Math.round(s.averageAfter))?.label ?? ""} afterwards
                  {s.averageShift !== null && s.averageShift > 0.05
                    ? `, up ${s.averageShift.toFixed(1)}`
                    : ""}
                  {" · "}
                  {s.practices} {s.practices === 1 ? "time" : "times"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">From your own check-ins after each practice.</p>
        </section>
      )}

      {showPrefs && (
        <PrefsSheet
          prefs={prefs}
          onChange={setPrefs}
          onClose={closePrefs}
          save={actions.updateBreathingPrefs}
        />
      )}
    </>
  );
}
