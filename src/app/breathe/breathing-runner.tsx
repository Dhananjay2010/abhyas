"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatClock, useWakeLock, vibrate, vibrationSupported } from "@/lib/session/device";
import { completeBreathingSession } from "./actions";

export type Pattern = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
  defaultCycles: number;
  benefit: string | null;
  contraindications: string | null;
};

type Phase = { kind: "inhale" | "hold_in" | "exhale" | "hold_out"; seconds: number };

const PHASE_LABEL: Record<Phase["kind"], string> = {
  inhale: "Breathe in",
  hold_in: "Hold",
  exhale: "Breathe out",
  hold_out: "Hold",
};

/** Zero-length phases are skipped: 4-7-8 has no hold after the exhale. */
function phasesOf(p: Pattern): Phase[] {
  return (
    [
      { kind: "inhale", seconds: p.inhale },
      { kind: "hold_in", seconds: p.holdIn },
      { kind: "exhale", seconds: p.exhale },
      { kind: "hold_out", seconds: p.holdOut },
    ] as Phase[]
  ).filter((x) => x.seconds > 0);
}

type Actions = { completeBreathingSession: typeof completeBreathingSession };
const REAL: Actions = { completeBreathingSession };

export function BreathingRunner({
  patterns,
  defaultMinutes,
  actions = REAL,
  onFinish,
}: {
  patterns: Pattern[];
  defaultMinutes: number;
  actions?: Actions;
  onFinish?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Pattern | null>(null);
  const [cycles, setCycles] = useState<number>(0);
  const [started, setStarted] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cycleDone, setCycleDone] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const savedRef = useRef(false);
  const phaseIndexRef = useRef(0);

  const startedAt = useRef<number>(0);
  const phaseEndsAt = useRef<number>(0);

  // Memoised deliberately: phasesOf() builds fresh objects, so without this
  // `phase` is a new reference on every render, the pacer effect tears down and
  // re-runs continuously, and phaseEndsAt is reset before the countdown can
  // ever reach zero — the timer simply never advances.
  const phases = useMemo(() => (selected ? phasesOf(selected) : []), [selected]);
  const phase = phases[phaseIndex];
  const totalCycles = cycles || selected?.defaultCycles || 10;

  // Derived rather than stored: setting "finished" from inside an effect is
  // what React now flags as a cascading render.
  const finished = started && cycleDone >= totalCycles;
  const running = started && !finished;
  useWakeLock(running);

  /**
   * Move to the next phase, counting a cycle when we wrap.
   *
   * The phase index is tracked in a ref as well as state so this can decide
   * whether it wrapped WITHOUT reading state inside an updater. An earlier
   * version called setCycleDone from inside the setPhaseIndex updater; React
   * invokes updaters twice in development to surface exactly that impurity, so
   * every cycle counted twice and Nadi Shodhana never reached its right-nostril
   * side.
   */
  const advance = useCallback(() => {
    const next = phaseIndexRef.current + 1;
    if (next < phases.length) {
      phaseIndexRef.current = next;
      setPhaseIndex(next);
    } else {
      phaseIndexRef.current = 0;
      setPhaseIndex(0);
      setCycleDone((c) => c + 1);
    }
  }, [phases.length]);

  useEffect(() => {
    if (!running || !phase) return;
    phaseEndsAt.current = Date.now() + phase.seconds * 1000;
    vibrate(phase.kind === "inhale" ? 60 : 30);

    const tick = () => {
      const left = (phaseEndsAt.current - Date.now()) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) advance();
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [running, phaseIndex, phase, advance]);

  // Recording the finished session is a genuine external-system sync, and the
  // ref makes sure it happens exactly once.
  useEffect(() => {
    if (!finished || savedRef.current || !selected) return;
    savedRef.current = true;
    const seconds = (Date.now() - startedAt.current) / 1000;
    startTransition(async () => {
      const r = await actions.completeBreathingSession({
        patternId: selected.id,
        durationSeconds: seconds,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }, [finished, selected, actions, router]);

  // ---- finished ----------------------------------------------------------
  if (finished && selected) {
    return (
      <div className="text-center">
        <p className="text-2xl font-bold">Done.</p>
        <p className="mt-2 text-muted">
          {totalCycles} cycles of {selected.name}.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button
          onClick={() => {
            setStarted(false);
            setSelected(null);
            setCycleDone(0);
            setPhaseIndex(0);
            phaseIndexRef.current = 0;
            savedRef.current = false;
            if (onFinish) onFinish();
          }}
          className="mt-8 w-full rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg"
        >
          Back to patterns
        </button>
      </div>
    );
  }

  // ---- running -----------------------------------------------------------
  if (running && selected && phase) {
    const progress = phase.seconds > 0 ? 1 - remaining / phase.seconds : 0;
    // The circle grows on the inhale, shrinks on the exhale, and holds still
    // during a hold, so the shape itself tells you what to do.
    const scale =
      phase.kind === "inhale"
        ? 0.45 + 0.55 * progress
        : phase.kind === "exhale"
          ? 1 - 0.55 * progress
          : phase.kind === "hold_in"
            ? 1
            : 0.45;

    const side =
      selected.slug === "nadi-shodhana"
        ? cycleDone % 2 === 0
          ? "Left nostril"
          : "Right nostril"
        : null;

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="grid h-64 w-64 place-items-center">
          <div
            aria-hidden="true"
            className="rounded-full bg-accent/20 ring-2 ring-accent"
            style={{
              width: 224,
              height: 224,
              transform: `scale(${scale})`,
              transition: "transform 120ms linear",
            }}
          />
          <div className="absolute">
            <p className="text-2xl font-bold">{PHASE_LABEL[phase.kind]}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-accent">
              {Math.ceil(remaining)}
            </p>
          </div>
        </div>

        {side && <p className="mt-4 text-sm text-accent">{side}</p>}
        {selected.slug === "physiological-sigh" && phase.kind === "inhale" && (
          <p className="mt-4 text-sm text-muted">
            Two inhales — a full one, then a short sniff on top.
          </p>
        )}

        <p className="mt-6 text-sm text-muted">
          Cycle {Math.min(cycleDone + 1, totalCycles)} of {totalCycles}
        </p>

        <button
          onClick={() => {
            setStarted(false);
            setCycleDone(0);
            setPhaseIndex(0);
            phaseIndexRef.current = 0;
          }}
          className="mt-8 rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm text-muted"
        >
          Stop
        </button>
      </div>
    );
  }

  // ---- set up a chosen pattern -------------------------------------------
  if (selected) {
    const cycleSeconds = phasesOf(selected).reduce((n, p) => n + p.seconds, 0);
    // The count derived from the user's preferred minutes lands on ugly numbers
    // (55 cycles, "10:05"), so it is rounded to the nearest five.
    const fromMinutes =
      Math.round((defaultMinutes * 60) / Math.max(1, cycleSeconds) / 5) * 5;
    const options = [selected.defaultCycles, fromMinutes, 20, 30]
      .filter((n, i, a) => n > 0 && a.indexOf(n) === i)
      .sort((a, b) => a - b);

    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-muted underline underline-offset-2"
        >
          ← All patterns
        </button>

        <h2 className="mt-4 text-2xl font-bold tracking-tight">{selected.name}</h2>
        {selected.description && (
          <p className="mt-2 leading-relaxed text-muted">{selected.description}</p>
        )}
        {selected.benefit && <p className="mt-3 text-sm text-accent">{selected.benefit}</p>}
        {selected.contraindications && (
          <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            {selected.contraindications}
          </p>
        )}

        <p className="mt-6 text-sm font-medium">How many cycles?</p>
        <p className="mb-2 text-xs text-muted">
          One cycle is {cycleSeconds} seconds.
        </p>
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          {options.map((n) => (
            <button
              key={n}
              onClick={() => setCycles(n)}
              aria-pressed={(cycles || selected.defaultCycles) === n}
              className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium ${
                (cycles || selected.defaultCycles) === n
                  ? "bg-accent text-accent-fg"
                  : "text-muted"
              }`}
            >
              {n}
              <span className="block text-[10px] opacity-70">
                {formatClock(n * cycleSeconds)}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            setCycleDone(0);
            setPhaseIndex(0);
            phaseIndexRef.current = 0;
            startedAt.current = Date.now();
            savedRef.current = false;
            setStarted(true);
          }}
          className="mt-8 w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg"
        >
          Start
        </button>

        {!vibrationSupported() && (
          <p className="mt-3 text-center text-[11px] text-muted/70">
            Haptics on each phase are unsupported on this device.
          </p>
        )}
        {pending && <p className="mt-3 text-center text-xs text-muted">Saving…</p>}
      </div>
    );
  }

  // ---- pattern list ------------------------------------------------------
  return (
    <ul className="space-y-2">
      {patterns.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => {
              setSelected(p);
              setCycles(0);
            }}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-muted/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{p.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {p.inhale}
                {p.holdIn > 0 && `-${p.holdIn}`}-{p.exhale}
                {p.holdOut > 0 && `-${p.holdOut}`}
              </span>
            </div>
            {p.benefit && <p className="mt-1 text-xs text-muted">{p.benefit}</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}
