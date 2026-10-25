"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unlockBreathAudio } from "@/lib/breathing/audio";
import { noteInAppStart } from "@/lib/breathing/client";
import { INTENTS, sessionSearch, type BreathingPrefs } from "@/lib/breathing/pattern";
import { routineLength, type ResolvedRoutine } from "@/lib/breathing/routine";
import { warmUpSpeech } from "@/lib/breathing/speech";
import type { PrefsPatch } from "@/lib/breathing/validation";
import { formatClock } from "@/lib/session/device";
import { updateBreathingPrefs } from "../../actions";
import { Choice, Field, Icon } from "../../controls";
import { RhythmPreview } from "../../rhythm-preview";
import { SoundControls } from "../../sound-controls";

type Actions = { updateBreathingPrefs: typeof updateBreathingPrefs };
const REAL: Actions = { updateBreathingPrefs };

/**
 * A routine: what is in it, in what order, and Start.
 *
 * Deliberately shorter than the practice setup screen. The lengths belong to
 * the routine rather than to you -- that is what makes it a routine rather
 * than three practices you have to line up yourself -- so the only choices
 * here are how it sounds.
 */
export function RoutineSetup({
  resolved,
  prefs,
  firstPractice,
  basePath = "/breathe",
  actions = REAL,
}: {
  resolved: ResolvedRoutine;
  prefs: BreathingPrefs;
  firstPractice: boolean;
  basePath?: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const { routine, steps, seconds } = resolved;

  const [sound, setSound] = useState({
    guidance: prefs.guidance,
    ambience: prefs.ambience,
    ambienceVolume: prefs.ambienceVolume,
    voiceLang: prefs.voiceLang,
  });
  const [showCount, setShowCount] = useState(prefs.showCount);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [, startTransition] = useTransition();

  const remember = (patch: PrefsPatch) =>
    startTransition(async () => {
      const r = await actions.updateBreathingPrefs(patch);
      setPrefError(r.ok ? null : r.error);
    });

  // Every caution any step carries, said once. A routine you cannot safely do
  // is one whose steps you cannot safely do.
  const cautions = [
    ...new Set(steps.map((s) => s.pattern.contraindications).filter((c): c is string => !!c)),
  ];

  const start = () => {
    if (starting) return;
    setStarting(true);
    // The gesture iOS needs before any sound: Web Audio and speech are granted
    // separately, and what this unlocks survives the navigation.
    if (sound.guidance !== "off") {
      unlockBreathAudio();
      if (sound.guidance === "voice") warmUpSpeech(sound.voiceLang);
    }
    noteInAppStart();
    router.push(
      `${basePath}/routine/${routine.slug}/session${sessionSearch({
        // The routine sets each step's length, so this one is ignored by the
        // player. It is sent because the URL shape is shared with a single
        // practice.
        cycles: 1,
        ...sound,
        showCount,
        vibrate: prefs.vibrate,
        settleIn: prefs.settleIn,
        checkIn: prefs.checkIn,
      })}`,
    );
  };

  return (
    <>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon.Back /> Breathe
      </Link>

      <section className="mt-6 text-center">
        <p className="text-[11px] font-semibold tracking-wider text-breath uppercase">Routine</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{routine.name}</h1>
        {routine.subtitle && <p className="mt-1 text-muted">{routine.subtitle}</p>}
        <p className="mt-3 text-xs text-muted">
          {[
            routineLength(seconds),
            `${steps.length} practices`,
            ...routine.intents.map((i) => INTENTS.find((x) => x.value === i)?.label ?? null),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-breath">{routine.description}</p>
      </section>

      <ol className="mt-8 space-y-2">
        {steps.map((step, i) => (
          <li
            key={`${step.pattern.slug}-${i}`}
            className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-breath/40 text-xs font-semibold tabular-nums text-breath">
              {i + 1}
            </span>
            <RhythmPreview phases={step.pattern.phases} shape={step.pattern.shape} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{step.pattern.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{step.label}</span>
              </div>
              {step.pattern.subtitle && (
                <p className="mt-0.5 truncate text-sm text-muted">{step.pattern.subtitle}</p>
              )}
              {step.pattern.adjusted && <p className="mt-0.5 text-xs text-breath">Your timings</p>}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-center text-xs text-muted">
        Each step runs into the next. {formatClock(seconds)} of breathing in all.
      </p>

      {cautions.length > 0 && (
        <div
          role="note"
          className="mt-6 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-100"
        >
          <Icon.Caution className="mt-0.5 shrink-0 text-amber-300" />
          <div className="space-y-1">
            {cautions.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        </div>
      )}

      {firstPractice && (
        <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          Breathe sitting or lying down, never while driving or in water. If you feel dizzy,
          tingly or short of breath, stop and breathe normally.
        </p>
      )}

      <section className="mt-7 space-y-4">
        <h2 className="text-sm font-medium">Guidance</h2>
        <SoundControls
          prefs={sound}
          onChange={(patch) => {
            setSound((s) => ({ ...s, ...patch }));
            remember(patch);
          }}
        />
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

      {routine.about && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            Why in this order
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{routine.about}</p>
        </section>
      )}
    </>
  );
}
