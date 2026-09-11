"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { audioSupported, unlockBreathAudio } from "@/lib/breathing/audio";
import { isIOS, noteInAppStart } from "@/lib/breathing/client";
import { buildCycle, cyclesForMinutes, initialCycles, lengthPlan } from "@/lib/breathing/engine";
import {
  INTENTS,
  LEVEL_LABEL,
  secondsLabel,
  sessionSearch,
  type BreathingPrefs,
  type Guidance,
  type Pattern,
} from "@/lib/breathing/pattern";
import type { PrefsPatch } from "@/lib/breathing/validation";
import { formatClock } from "@/lib/session/device";
import { updateBreathingPrefs } from "../actions";
import { Choice, Field, Icon } from "../controls";
import { RhythmPreview } from "../rhythm-preview";
import { useClientValue } from "../use-media";

type Actions = { updateBreathingPrefs: typeof updateBreathingPrefs };
const REAL: Actions = { updateBreathingPrefs };

const segment = (on: boolean) =>
  `min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
  }`;

/**
 * One practice: what it is, how long, how it will sound, and Start.
 *
 * Length is chosen in minutes, the unit people think in. 4-7-8 is the
 * exception: it is capped at eight breaths, so it is chosen in breaths and
 * never offers more (bug B3).
 */
export function PracticeSetup({
  pattern,
  prefs,
  lastCycles,
  firstPractice,
  basePath = "/breathe",
  actions = REAL,
}: {
  pattern: Pattern;
  prefs: BreathingPrefs;
  /** The length used last time for this pattern, if there was a last time. */
  lastCycles: number | null;
  firstPractice: boolean;
  basePath?: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const cycle = useMemo(() => buildCycle(pattern.phases), [pattern.phases]);
  const plan = useMemo(() => lengthPlan(cycle, pattern.maxCycles), [cycle, pattern.maxCycles]);

  const [cycles, setCycles] = useState(() =>
    initialCycles({
      cycle,
      maxCycles: pattern.maxCycles,
      defaultCycles: pattern.defaultCycles,
      preferredMinutes: prefs.defaultMinutes,
      lastCycles,
    }),
  );
  const [custom, setCustom] = useState(() => !plan.options.some((o) => o.cycles === cycles));
  const [guidance, setGuidance] = useState<Guidance>(prefs.guidance);
  const [showCount, setShowCount] = useState(prefs.showCount);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [, startTransition] = useTransition();

  const canPlay = useClientValue(audioSupported, true);
  const silentSwitchMutes = useClientValue(() => isIOS() && !("audioSession" in navigator), false);

  const seconds = Math.round(cycle.seconds * cycles);
  const breaths = cycles * cycle.breaths;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const atCap = pattern.maxCycles !== null && cycles >= pattern.maxCycles;

  const remember = (patch: PrefsPatch) =>
    startTransition(async () => {
      const r = await actions.updateBreathingPrefs(patch);
      setPrefError(r.ok ? null : r.error);
    });

  const start = () => {
    if (starting) return;
    setStarting(true);
    // This tap is the gesture iOS needs before any sound is allowed, and the
    // context it unlocks survives the navigation to the practice screen.
    if (guidance === "tones") unlockBreathAudio();
    noteInAppStart();
    router.push(
      `${basePath}/${pattern.slug}/session${sessionSearch({
        cycles,
        guidance,
        showCount,
        vibrate: prefs.vibrate,
        settleIn: prefs.settleIn,
        checkIn: prefs.checkIn,
      })}`,
    );
  };

  const soundHint = !canPlay
    ? "This browser cannot play sound."
    : guidance === "tones"
      ? silentSwitchMutes
        ? "A soft tone rises as you breathe in and falls as you breathe out. On this iPhone the silent switch mutes it."
        : "A soft tone rises as you breathe in and falls as you breathe out, so you can close your eyes."
      : null;

  return (
    <>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon.Back /> Breathe
      </Link>

      <section className="mt-6 flex flex-col items-center text-center">
        <RhythmPreview phases={pattern.phases} size={136} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{pattern.name}</h1>
        {pattern.subtitle && <p className="mt-1 text-muted">{pattern.subtitle}</p>}

        <ul aria-label="One round" className="mt-4 flex flex-wrap justify-center gap-1.5">
          {cycle.phases.map((p) => (
            <li
              key={p.index}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
            >
              <span className="font-medium text-fg">
                {p.label}
                {p.side ? ` ${p.side === "left" ? "L" : "R"}` : ""}
              </span>{" "}
              <span className="tabular-nums">{secondsLabel(p.seconds)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted">
          {[
            LEVEL_LABEL[pattern.level] ?? null,
            ...pattern.intents.map((i) => INTENTS.find((x) => x.value === i)?.label ?? null),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {pattern.benefit && (
          <p className="mt-4 text-sm leading-relaxed text-breath">{pattern.benefit}</p>
        )}
      </section>

      {pattern.contraindications && (
        <div
          role="note"
          className="mt-6 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-100"
        >
          <Icon.Caution className="mt-0.5 shrink-0 text-amber-300" />
          <p>{pattern.contraindications}</p>
        </div>
      )}

      {firstPractice && (
        <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          Breathe sitting or lying down, never while driving or in water. If you feel
          dizzy, tingly or short of breath, stop and breathe normally.
        </p>
      )}

      {pattern.howTo.length > 0 && (
        // Open for a pattern you have never done, folded away once you have.
        <details
          open={lastCycles === null}
          className="group mt-6 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            How to do it
            <Icon.Chevron className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
            {pattern.howTo.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">How long?</h2>
          <span className="text-xs tabular-nums text-muted">
            {breaths} {breaths === 1 ? "breath" : "breaths"} · {formatClock(seconds)}
          </span>
        </div>
        <div role="radiogroup" aria-label="Length" className="mt-2 flex gap-1 rounded-xl bg-surface-2 p-1">
          {plan.options.map((o) => {
            const on = !custom && o.cycles === cycles;
            return (
              <button
                key={o.cycles}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setCustom(false);
                  setCycles(o.cycles);
                }}
                className={segment(on)}
              >
                {o.label}
              </button>
            );
          })}
          {plan.maxMinutes !== null && (
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => setCustom(true)}
              className={segment(custom)}
            >
              Custom
            </button>
          )}
        </div>

        {custom && plan.maxMinutes !== null && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
            <button
              type="button"
              aria-label="One minute less"
              disabled={minutes <= 1}
              onClick={() => setCycles(cyclesForMinutes(cycle, minutes - 1, pattern.maxCycles))}
              className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-xl disabled:opacity-40"
            >
              −
            </button>
            <span aria-live="polite" className="text-lg font-semibold tabular-nums">
              {minutes} min
            </span>
            <button
              type="button"
              aria-label="One minute more"
              disabled={minutes >= plan.maxMinutes}
              onClick={() => setCycles(cyclesForMinutes(cycle, minutes + 1, pattern.maxCycles))}
              className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-xl disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}

        {atCap && (
          <p className="mt-2 text-xs text-muted">That is as many as this practice allows in one go.</p>
        )}
      </section>

      <section className="mt-7 space-y-4">
        <h2 className="text-sm font-medium">Guidance</h2>
        <Field label="Sound" hint={soundHint}>
          <Choice
            label="Sound"
            value={guidance}
            options={[
              { value: "tones", label: "Tones" },
              { value: "off", label: "Off" },
            ]}
            onChange={(g) => {
              setGuidance(g);
              remember({ guidance: g });
            }}
          />
        </Field>
        <Field label="Seconds count">
          <Choice
            label="Seconds count"
            value={showCount}
            options={[
              { value: true, label: "Show" },
              { value: false, label: "Hide" },
            ]}
            onChange={(v) => {
              setShowCount(v);
              remember({ showCount: v });
            }}
          />
        </Field>
        {prefError && (
          <p role="alert" className="text-xs text-danger">
            {prefError}
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={start}
        disabled={starting}
        className="mt-8 w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {starting ? "Starting…" : "Start"}
      </button>

      {pattern.why && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Why it works</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{pattern.why}</p>
          {pattern.evidenceUrl && (
            <a
              href={pattern.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-breath underline underline-offset-2"
            >
              {pattern.evidenceLabel ?? "The research"}
            </a>
          )}
        </section>
      )}
    </>
  );
}
