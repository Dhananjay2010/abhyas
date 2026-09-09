"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/database.types";
import type { WarmupItem } from "@/lib/program/warmup";
import {
  formatClock,
  useBeeper,
  useElapsed,
  useWakeLock,
  vibrate,
  vibrationSupported,
} from "@/lib/session/device";
import {
  abandonSession,
  finishExercise,
  finishSession,
  findAlternatives,
  logSet,
  markWarmupDone,
  swapExercise,
  type Alternative,
} from "../actions";

/** Injected so the runner can be exercised without a signed-in session. */
export type SessionActions = {
  markWarmupDone: typeof markWarmupDone;
  logSet: typeof logSet;
  finishExercise: typeof finishExercise;
  finishSession: typeof finishSession;
  abandonSession: typeof abandonSession;
  findAlternatives: typeof findAlternatives;
  swapExercise: typeof swapExercise;
};

const REAL_ACTIONS: SessionActions = {
  markWarmupDone,
  logSet,
  finishExercise,
  finishSession,
  abandonSession,
  findAlternatives,
  swapExercise,
};

type Feel = Database["public"]["Enums"]["set_feel"];
type Muscle = Database["public"]["Enums"]["muscle"];

export type LoggedSet = { setNumber: number; reps: number | null; weightKg: number | null };

export type RunnerExercise = {
  id: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  primaryMuscles: Muscle[];
  plannedSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  status: Database["public"]["Enums"]["exercise_status"];
  feel: Feel | null;
  sets: LoggedSet[];
};

export type RunnerSettings = {
  perSetLogging: boolean;
  restAutostart: boolean;
  restSound: boolean;
  restVibrate: boolean;
  restOverrideSeconds: number | null;
  cooldownEnabled: boolean;
};

type Phase = "warmup" | "work" | "cooldown" | "done";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "right", label: "Just right" },
  { value: "hard", label: "Hard" },
];

export function SessionRunner({
  sessionId,
  isDeload,
  week,
  warmupAlreadyDone,
  startedAt,
  warmup,
  exercises: initialExercises,
  settings,
  actions = REAL_ACTIONS,
  onExit,
}: {
  sessionId: string;
  isDeload: boolean;
  week: number;
  warmupAlreadyDone: boolean;
  startedAt: string | null;
  warmup: WarmupItem[];
  exercises: RunnerExercise[];
  settings: RunnerSettings;
  actions?: SessionActions;
  onExit?: () => void;
}) {
  const router = useRouter();
  const elapsed = useElapsed(startedAt);
  const beeper = useBeeper(settings.restSound);
  const [exercises, setExercises] = useState(initialExercises);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [progressNotes, setProgressNotes] = useState<{ name: string; message: string }[]>([]);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);

  // Resume where the session actually stopped rather than at the top.
  const firstUnfinished = Math.max(
    0,
    exercises.findIndex((e) => e.status === "pending"),
  );
  const [phase, setPhase] = useState<Phase>(
    warmupAlreadyDone || warmup.length === 0 ? "work" : "warmup",
  );
  const [warmupIndex, setWarmupIndex] = useState(0);
  const [exerciseIndex, setExerciseIndex] = useState(
    exercises.findIndex((e) => e.status === "pending") === -1 ? 0 : firstUnfinished,
  );

  const wakeLock = useWakeLock(phase !== "done");

  // ---- rest timer -------------------------------------------------------
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restRemaining, setRestRemaining] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (restEndsAt === null) return;
    firedRef.current = false;
    const tick = () => {
      const left = Math.max(0, Math.round((restEndsAt - Date.now()) / 1000));
      setRestRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        if (settings.restSound) beeper.beep();
        if (settings.restVibrate) vibrate([180, 90, 180]);
        setRestEndsAt(null);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [restEndsAt, beeper, settings.restSound, settings.restVibrate]);

  const startRest = useCallback(
    (seconds: number) => setRestEndsAt(Date.now() + seconds * 1000),
    [],
  );

  // Audio must be unlocked inside a real gesture; every tap is a chance.
  const onAnyTap = useCallback(() => beeper.unlock(), [beeper]);

  const current = exercises[exerciseIndex];
  const restSeconds = settings.restOverrideSeconds ?? current?.restSeconds ?? 90;

  const totalSetsPlanned = useMemo(
    () => exercises.reduce((n, e) => n + e.plannedSets, 0),
    [exercises],
  );
  const totalSetsDone = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.length, 0),
    [exercises],
  );

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) {
    const r = await fn();
    if (!r.ok) setError("error" in r ? (r.error ?? "Something went wrong") : "Failed");
    else setError(null);
    return r.ok;
  }

  // ---- warm-up ----------------------------------------------------------
  if (phase === "warmup") {
    const item = warmup[warmupIndex];
    const isLast = warmupIndex === warmup.length - 1;
    return (
      <Shell
        title="Warm-up"
        subtitle={`${warmupIndex + 1} of ${warmup.length}`}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
      >
        <div onPointerDown={onAnyTap}>
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">
            {item.phase === "cardio"
              ? "Raise your heart rate"
              : item.phase === "prehab"
                ? "Prehab — for a joint you flagged"
                : "Mobility for today's muscles"}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{item.name}</h2>
          <p className="mt-2 text-lg text-accent tabular-nums">
            {Math.round(item.duration_seconds / 60) >= 1
              ? `${Math.round(item.duration_seconds / 60)} min`
              : `${item.duration_seconds}s`}
          </p>
          {item.instructions?.length > 0 && (
            <ul className="mt-6 space-y-2 text-muted">
              {item.instructions.map((line, i) => (
                <li key={i} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 space-y-3">
            <BigButton
              onClick={async () => {
                if (isLast) {
                  await run(() => actions.markWarmupDone(sessionId));
                  setPhase("work");
                } else {
                  setWarmupIndex((i) => i + 1);
                }
              }}
            >
              {isLast ? "Warm-up done, start training" : "Next"}
            </BigButton>
            <GhostButton
              onClick={async () => {
                await run(() => actions.markWarmupDone(sessionId));
                setPhase("work");
              }}
            >
              Skip the rest of the warm-up
            </GhostButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- cool-down --------------------------------------------------------
  if (phase === "cooldown") {
    return (
      <Shell
        title="Cool-down"
        subtitle="5 minutes"
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
      >
        <p className="text-muted">
          Ease down and stretch what you trained. Hold each for about 30 seconds,
          breathing slowly. Nothing should be sharp.
        </p>
        <ul className="mt-6 space-y-2">
          {warmup
            .filter((w) => w.phase === "mobility")
            .slice(0, 4)
            .map((w) => (
              <li
                key={w.id}
                className="rounded-xl border border-border bg-surface px-4 py-3 font-medium"
              >
                {w.name}
              </li>
            ))}
        </ul>
        <div className="mt-10 space-y-3">
          <BigButton
            onClick={async () => {
              await run(() =>
                actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: true }),
              );
              setPhase("done");
            }}
          >
            Done
          </BigButton>
          <GhostButton
            onClick={async () => {
              await run(() =>
                actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: false }),
              );
              setPhase("done");
            }}
          >
            Skip cool-down
          </GhostButton>
        </div>
      </Shell>
    );
  }

  // ---- summary ----------------------------------------------------------
  if (phase === "done") {
    const volume = exercises.reduce(
      (n, e) => n + e.sets.reduce((m, s) => m + (s.reps ?? 0) * (s.weightKg ?? 0), 0),
      0,
    );
    return (
      <Shell
        title="Session complete"
        subtitle={null}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
      >
        <div className="space-y-3">
          <Stat label="Time" value={formatClock(elapsed)} />
          <Stat label="Sets logged" value={`${totalSetsDone}`} />
          {volume > 0 && <Stat label="Total volume" value={`${Math.round(volume)} kg`} />}
          <Stat
            label="Exercises"
            value={`${exercises.filter((e) => e.status === "completed").length} of ${exercises.length}`}
          />
        </div>
        {progressNotes.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
              What changed for next time
            </h2>
            <ul className="space-y-2">
              {progressNotes.map((n, i) => (
                <li key={i} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                  <span className="font-semibold">{n.name}</span>
                  <p className="mt-1 text-muted">{n.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10">
          <BigButton
            onClick={() => {
              if (onExit) return onExit();
              router.push("/today");
              router.refresh();
            }}
          >
            Back to Today
          </BigButton>
        </div>
      </Shell>
    );
  }

  // ---- work -------------------------------------------------------------
  if (!current) {
    return (
      <Shell
        title="Nothing to do"
        subtitle={null}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
      >
        <p className="text-muted">
          This session has no exercises. That usually means the plan could not
          find anything matching your equipment, level and injuries for today.
        </p>
        <p className="mt-3 text-muted">
          Check your equipment list in Settings, then rebuild your block from
          Today.
        </p>
        <div className="mt-8">
          <BigButton onClick={() => router.push("/today")}>Back to Today</BigButton>
        </div>
      </Shell>
    );
  }

  const setsDone = current.sets.length;
  const allSetsDone = setsDone >= current.plannedSets;
  const nextSetNumber = setsDone + 1;
  // Prefer a weight already logged this session; otherwise start from where
  // progression left this lift (reduced during a deload week).
  const lastWeight =
    [...current.sets].reverse().find((s) => s.weightKg !== null)?.weightKg ??
    current.suggestedWeightKg;

  async function onLogSet(reps: number | null, weightKg: number | null) {
    const ok = await run(() =>
      actions.logSet({
        sessionExerciseId: current.id,
        setNumber: nextSetNumber,
        reps,
        weightKg,
      }),
    );
    if (!ok) return;
    setExercises((prev) =>
      prev.map((e) =>
        e.id === current.id
          ? { ...e, sets: [...e.sets, { setNumber: nextSetNumber, reps, weightKg }] }
          : e,
      ),
    );
    if (settings.restAutostart && nextSetNumber < current.plannedSets) {
      startRest(restSeconds);
    }
  }

  async function onFinishExercise(feel: Feel | null, skipped = false) {
    const result = await actions.finishExercise({
      sessionExerciseId: current.id,
      feel,
      skipped,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.data?.message) {
      setProgressNotes((prev) => [...prev, { name: current.name, message: result.data!.message }]);
    }
    setExercises((prev) =>
      prev.map((e) =>
        e.id === current.id ? { ...e, status: skipped ? "skipped" : "completed", feel } : e,
      ),
    );
    setRestEndsAt(null);

    const next = exercises.findIndex((e, i) => i > exerciseIndex && e.status === "pending");
    if (next === -1) {
      if (settings.cooldownEnabled) setPhase("cooldown");
      else {
        await run(() =>
          actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: false }),
        );
        setPhase("done");
      }
    } else {
      setExerciseIndex(next);
    }
  }

  return (
    <Shell
      title={`Exercise ${exerciseIndex + 1} of ${exercises.length}`}
      subtitle={isDeload ? `Deload week ${week}` : `Week ${week}`}
      elapsed={elapsed}
      onExit={() => (onExit ? onExit() : router.push("/today"))}
      wakeLock={wakeLock}
      error={error}
    >
      <div onPointerDown={onAnyTap}>
        {progressNotes.length > 0 && (
          <p className="mb-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <span className="font-semibold">{progressNotes[progressNotes.length - 1].name}:</span>{" "}
            {progressNotes[progressNotes.length - 1].message}
          </p>
        )}
        <h2 className="text-3xl font-bold tracking-tight">{current.name}</h2>
        <p className="mt-2 text-accent">
          {current.plannedSets} sets × {current.repsMin}–{current.repsMax} reps
        </p>
        {current.cue && <p className="mt-2 text-sm text-muted">{current.cue}</p>}
        {current.workingWeightKg !== null && (
          <p className="mt-2 text-sm text-muted">
            Working weight {current.workingWeightKg} kg
            {current.suggestedWeightKg !== null &&
              current.suggestedWeightKg !== current.workingWeightKg &&
              ` · today ${current.suggestedWeightKg} kg`}
          </p>
        )}
        {isDeload && (
          <p className="mt-3 text-sm text-muted">
            Deload — keep the weight light and stop well short of failure.
          </p>
        )}

        {restRemaining > 0 && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-5 py-4">
            <span className="text-sm text-accent">Rest</span>
            <span className="text-3xl font-bold tabular-nums text-accent">
              {formatClock(restRemaining)}
            </span>
            <button
              onClick={() => setRestEndsAt(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-accent underline"
            >
              Skip
            </button>
          </div>
        )}

        <ol className="mt-6 space-y-2">
          {Array.from({ length: current.plannedSets }, (_, i) => i + 1).map((n) => {
            const logged = current.sets.find((s) => s.setNumber === n);
            return (
              <li
                key={n}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  logged
                    ? "border-border bg-surface-2 text-muted"
                    : n === nextSetNumber
                      ? "border-accent bg-surface"
                      : "border-border bg-surface text-muted"
                }`}
              >
                <span className="text-sm font-medium">Set {n}</span>
                <span className="text-sm tabular-nums">
                  {logged
                    ? settings.perSetLogging
                      ? `${logged.reps ?? "—"} reps${logged.weightKg ? ` · ${logged.weightKg} kg` : ""}`
                      : "done"
                    : "—"}
                </span>
              </li>
            );
          })}
        </ol>

        {!allSetsDone && (
          <SetEntry
            key={nextSetNumber}
            perSetLogging={settings.perSetLogging}
            defaultWeight={lastWeight}
            repsTarget={current.repsMax}
            setNumber={nextSetNumber}
            onLog={onLogSet}
          />
        )}

        {allSetsDone && (
          <div className="mt-8">
            <p className="mb-3 text-sm font-medium">How did that feel?</p>
            <div className="grid grid-cols-3 gap-2">
              {FEELS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => onFinishExercise(f.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {alternatives && (
          <div className="mt-8">
            <p className="mb-3 text-sm font-medium">
              Swap for something that works the same pattern
            </p>
            {alternatives.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing else matches your equipment and injuries for this movement.
              </p>
            ) : (
              <ul className="space-y-2">
                {alternatives.map((a) => (
                  <li key={a.exerciseId}>
                    <button
                      onClick={async () => {
                        const ok = await run(() =>
                          actions.swapExercise({
                            sessionExerciseId: current.id,
                            newExerciseId: a.exerciseId,
                          }),
                        );
                        if (!ok) return;
                        setExercises((prev) =>
                          prev.map((e) =>
                            e.id === current.id
                              ? { ...e, name: a.name, cue: a.cue, exerciseId: a.exerciseId }
                              : e,
                          ),
                        );
                        setAlternatives(null);
                      }}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent"
                    >
                      <span className="font-medium">{a.name}</span>
                      {a.cue && <p className="mt-1 text-xs text-muted">{a.cue}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <GhostButton onClick={() => setAlternatives(null)}>Cancel</GhostButton>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-2">
          {!alternatives && current.sets.length === 0 && (
            <GhostButton
              onClick={async () => {
                setLoadingAlternatives(true);
                const r = await actions.findAlternatives(current.id);
                setLoadingAlternatives(false);
                if (!r.ok) return setError(r.error);
                setAlternatives(r.data);
              }}
            >
              {loadingAlternatives ? "Finding alternatives…" : "Swap this exercise"}
            </GhostButton>
          )}
          <GhostButton onClick={() => onFinishExercise(null, true)}>
            Skip this exercise
          </GhostButton>
          <GhostButton
            onClick={async () => {
              if (await run(() => actions.abandonSession(sessionId))) {
                if (onExit) onExit();
                else router.push("/today");
              }
            }}
          >
            End session early
          </GhostButton>
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          {totalSetsDone} of {totalSetsPlanned} sets logged
        </p>

        <CapabilityNote
          wakeLock={wakeLock}
          soundEnabled={settings.restSound}
          soundUnlocked={beeper.unlocked}
          vibrateEnabled={settings.restVibrate}
        />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function SetEntry({
  perSetLogging,
  defaultWeight,
  repsTarget,
  setNumber,
  onLog,
}: {
  perSetLogging: boolean;
  defaultWeight: number | null;
  repsTarget: number;
  setNumber: number;
  onLog: (reps: number | null, weightKg: number | null) => void;
}) {
  // Remounted per set via a key at the call site, so the fields reset naturally
  // rather than being reset from an effect.
  const [reps, setReps] = useState(String(repsTarget));
  const [weight, setWeight] = useState(defaultWeight !== null ? String(defaultWeight) : "");

  if (!perSetLogging) {
    return (
      <div className="mt-6">
        <BigButton onClick={() => onLog(null, null)}>Set {setNumber} done</BigButton>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">Reps</span>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-4 text-center text-2xl font-semibold tabular-nums outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Weight (kg)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="—"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-4 text-center text-2xl font-semibold tabular-nums outline-none placeholder:text-muted/50 focus:border-accent"
          />
        </label>
      </div>
      <div className="mt-3">
        <BigButton
          onClick={() =>
            onLog(reps === "" ? null : Number(reps), weight === "" ? null : Number(weight))
          }
        >
          Log set {setNumber}
        </BigButton>
      </div>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  elapsed,
  onExit,
  wakeLock,
  error,
  children,
}: {
  title: string;
  subtitle: string | null;
  elapsed: number;
  onExit: () => void;
  wakeLock: { active: boolean };
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-6 pt-6 pb-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-wider text-muted uppercase">{title}</p>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {wakeLock.active && (
            <span
              title="Screen kept awake"
              aria-label="Screen kept awake"
              className="h-2 w-2 rounded-full bg-success"
            />
          )}
          <span className="text-sm tabular-nums text-muted">{formatClock(elapsed)}</span>
          <button
            onClick={onExit}
            aria-label="Leave session"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted"
          >
            Exit
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="mt-8">{children}</div>
    </main>
  );
}

function BigButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Honest readout of what this device actually supports. Wake lock, audio and
 * vibration all fail differently across browsers -- iOS Safari has never
 * implemented navigator.vibrate at all -- so the state is shown rather than
 * assumed.
 */
function CapabilityNote({
  wakeLock,
  soundEnabled,
  soundUnlocked,
  vibrateEnabled,
}: {
  wakeLock: { supported: boolean; active: boolean; error: string | null };
  soundEnabled: boolean;
  soundUnlocked: boolean;
  vibrateEnabled: boolean;
}) {
  const bits: string[] = [];
  bits.push(
    !wakeLock.supported
      ? "screen may sleep (wake lock unsupported)"
      : wakeLock.active
        ? "screen kept awake"
        : `screen may sleep${wakeLock.error ? ` (${wakeLock.error})` : ""}`,
  );
  if (soundEnabled) bits.push(soundUnlocked ? "sound ready" : "sound arms on first tap");
  if (vibrateEnabled && !vibrationSupported()) bits.push("vibration unsupported here");

  return <p className="mt-4 text-center text-[11px] text-muted/70">{bits.join(" · ")}</p>;
}
