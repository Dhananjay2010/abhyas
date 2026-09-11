"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { BreathingStats } from "@/lib/breathing/stats";
import { CARD_BG } from "@/lib/breathing/theme";
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
  const s = stats.weekSeconds;
  const week =
    s === 0
      ? "Nothing yet this week"
      : s < 60
        ? "Under a minute this week"
        : `${Math.round(s / 60)} min this week`;
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
  prefs: initialPrefs,
  stats,
  lastCyclesByPattern,
  last,
  intent: initialIntent,
  todayIndex,
  basePath = "/breathe",
  actions = REAL,
}: {
  patterns: Pattern[];
  prefs: BreathingPrefs;
  stats: BreathingStats;
  lastCyclesByPattern: Record<string, number>;
  last: LastPractice | null;
  intent: Intent | null;
  todayIndex: number;
  basePath?: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [intent, setIntent] = useState<Intent | null>(initialIntent);
  const [showPrefs, setShowPrefs] = useState(false);
  const [starting, setStarting] = useState(false);
  const closePrefs = useCallback(() => setShowPrefs(false), []);

  const available = INTENTS.filter((i) => patterns.some((p) => p.intents.includes(i.value)));
  const shown = intent ? patterns.filter((p) => p.intents.includes(intent)) : patterns;
  const again = last ? patterns.find((p) => p.id === last.patternId) : undefined;
  const againLength = again && last ? lengthFor(again, prefs, last.cycles) : null;
  const starter = patterns.find((p) => p.slug === STARTER_SLUG);

  const chooseIntent = (next: Intent | null) => {
    setIntent(next);
    // Kept in the URL, so coming back from a practice restores the filter.
    window.history.replaceState(null, "", next ? `${basePath}?intent=${next}` : basePath);
  };

  const startAgain = () => {
    if (!again || !againLength || starting) return;
    setStarting(true);
    // This tap is the gesture that lets the practice screen make sound.
    if (prefs.guidance === "tones") unlockBreathAudio();
    noteInAppStart();
    router.push(
      `${basePath}/${again.slug}/session${sessionSearch({
        cycles: againLength.cycles,
        guidance: prefs.guidance,
        showCount: prefs.showCount,
        vibrate: prefs.vibrate,
        settleIn: prefs.settleIn,
        checkIn: prefs.checkIn,
      })}`,
    );
  };

  return (
    <>
      <header className="flex items-start justify-between gap-4">
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
      </header>

      <WeekStrip days={stats.weekDays} todayIndex={todayIndex} className="mt-6" />

      {again && againLength ? (
        <button
          type="button"
          onClick={startAgain}
          disabled={starting}
          className="mt-7 flex w-full items-center gap-4 rounded-2xl border border-breath/25 px-5 py-4 text-left transition-colors hover:border-breath/50 disabled:opacity-70"
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
        </button>
      ) : starter ? (
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
          <RhythmPreview phases={starter.phases} size={48} />
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

      <ul className="mt-4 space-y-2">
        {shown.map((p) => {
          const len = lengthFor(p, prefs, lastCyclesByPattern[p.id] ?? null);
          return (
            <li key={p.id}>
              <Link
                href={`${basePath}/${p.slug}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-breath/40"
              >
                <RhythmPreview phases={p.phases} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{len.label}</span>
                  </div>
                  {p.subtitle && <p className="mt-0.5 text-sm text-muted">{p.subtitle}</p>}
                  {p.intents.length > 0 && (
                    <p className="mt-1 text-xs text-breath">{p.intents.map(intentLabel).join(" · ")}</p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

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
