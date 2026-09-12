"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { unlockBreathAudio } from "@/lib/breathing/audio";
import { noteInAppStart } from "@/lib/breathing/client";
import { buildCycle, cyclesForMinutes, initialCycles, lengthPlan, type BreathPhase } from "@/lib/breathing/engine";
import {
  INTENTS,
  LEVEL_LABEL,
  draftFrom,
  secondsLabel,
  sessionSearch,
  type BreathingPrefs,
  type Pattern,
} from "@/lib/breathing/pattern";
import { warmUpSpeech } from "@/lib/breathing/speech";
import { validatePatternDraft, type PrefsPatch } from "@/lib/breathing/validation";
import { formatClock } from "@/lib/session/device";
import {
  resetPatternTiming,
  savePatternTiming,
  saveCustomPattern,
  updateBreathingPrefs,
} from "../actions";
import { Choice, Field, Icon } from "../controls";
import { RhythmPreview } from "../rhythm-preview";
import { SoundControls } from "../sound-controls";
import { TimingEditor } from "../timing-editor";

type Actions = {
  updateBreathingPrefs: typeof updateBreathingPrefs;
  savePatternTiming: typeof savePatternTiming;
  resetPatternTiming: typeof resetPatternTiming;
  saveCustomPattern: typeof saveCustomPattern;
};
const REAL: Actions = {
  updateBreathingPrefs,
  savePatternTiming,
  resetPatternTiming,
  saveCustomPattern,
};

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
  // How this practice will sound. These are preferences too, so a change here
  // is remembered for next time.
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
    // This tap is the gesture iOS needs before any sound is allowed -- Web
    // Audio and speech are granted separately -- and what it unlocks survives
    // the navigation to the practice screen.
    if (sound.guidance !== "off") {
      unlockBreathAudio();
      if (sound.guidance === "voice") warmUpSpeech(sound.voiceLang);
    }
    noteInAppStart();
    router.push(
      `${basePath}/${pattern.slug}/session${sessionSearch({
        cycles,
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

      <section className="mt-6 flex flex-col items-center text-center">
        <RhythmPreview phases={pattern.phases} size={136} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{pattern.name}</h1>
        {(pattern.kind === "mine" || pattern.adjusted) && (
          <p className="mt-2 rounded-full border border-breath/30 px-3 py-1 text-xs text-breath">
            {pattern.kind === "mine" ? "Your own practice" : "Your timings"}
          </p>
        )}
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

      {/* Remounts when the saved timings change, so the editor always opens on
          what is actually saved. */}
      <TimingSection
        key={JSON.stringify(pattern.phases)}
        pattern={pattern}
        basePath={basePath}
        actions={actions}
      />

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

/**
 * Your own timings for this practice.
 *
 * It edits the seconds of the phases the practice already has -- never their
 * order, their words, or which nostril is open -- so it works for Nadi
 * Shodhana's six phases and the sigh's two-part inhale as well as for a
 * four-count square. `SPEC.md` section 9.4 asked for this from the start.
 */
function TimingSection({
  pattern,
  basePath,
  actions,
}: {
  pattern: Pattern;
  basePath: string;
  actions: Actions;
}) {
  const router = useRouter();
  const [phases, setPhases] = useState<BreathPhase[]>(pattern.phases);
  const [status, setStatus] = useState<{
    state: "idle" | "saving" | "saved" | "error";
    error?: string;
  }>({ state: "idle" });
  const [, startTransition] = useTransition();

  const changed = JSON.stringify(phases) !== JSON.stringify(pattern.phases);
  const draft = draftFrom(pattern.name, phases);

  const save = () => {
    const invalid = validatePatternDraft(draft);
    if (invalid) return setStatus({ state: "error", error: invalid });
    setStatus({ state: "saving" });
    startTransition(async () => {
      const r =
        pattern.kind === "mine" && pattern.userPatternId
          ? await actions.saveCustomPattern({ id: pattern.userPatternId, draft })
          : await actions.savePatternTiming({ basePatternId: pattern.id, draft });
      if (!r.ok) return setStatus({ state: "error", error: r.error });
      setStatus({ state: "saved" });
      router.refresh();
    });
  };

  const reset = () => {
    setStatus({ state: "saving" });
    startTransition(async () => {
      const r = await actions.resetPatternTiming(pattern.id);
      if (!r.ok) return setStatus({ state: "error", error: r.error });
      setPhases(pattern.defaultPhases);
      setStatus({ state: "saved" });
      router.refresh();
    });
  };

  return (
    <details className="group mt-6 rounded-xl border border-border bg-surface px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        {pattern.kind === "mine" ? "Timing" : "Adjust timing"}
        <Icon.Chevron className="text-muted transition-transform group-open:rotate-180" />
      </summary>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        {pattern.kind === "mine"
          ? "Your practice, for as long as you want each part to be."
          : "Make it yours. Saved timings are used every time you practise this."}
      </p>

      <div className="mt-3">
        <TimingEditor
          phases={phases}
          onChange={setPhases}
          canRemoveHolds={pattern.kind === "mine"}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!changed || status.state === "saving"}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg disabled:opacity-40"
        >
          {status.state === "saving" ? "Saving…" : "Save timings"}
        </button>
        {pattern.adjusted && (
          <button
            type="button"
            onClick={reset}
            disabled={status.state === "saving"}
            className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            Reset
          </button>
        )}
      </div>

      <p aria-live="polite" className="mt-2 min-h-4 text-xs">
        {status.state === "saved" && <span className="text-muted">Saved</span>}
        {status.state === "error" && <span className="text-danger">{status.error}</span>}
      </p>

      {pattern.kind === "mine" && pattern.userPatternId && (
        <Link
          href={`${basePath}/new?id=${pattern.userPatternId}`}
          className="text-xs text-muted underline underline-offset-2 hover:text-fg"
        >
          Rename or delete this practice
        </Link>
      )}
    </details>
  );
}
