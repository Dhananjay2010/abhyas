"use client";

import { useState } from "react";
import type { WarmupItem } from "@/lib/program/warmup";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "@/app/session/[id]/session-runner";

const ok = async () => ({ ok: true }) as const;

const STUB: SessionActions = {
  markWarmupDone: ok,
  logSet: ok,
  deleteSet: ok,
  /*
    A PR on the first exercise and none on the rest, which is what the summary
    has to cope with: a "Personal bests" section listing only the exercises that
    beat something, and a progression note for every one of them.
  */
  finishExercise: (() => {
    let n = 0;
    return async () => ({
      ok: true as const,
      data:
        n++ === 0
          ? {
              outcome: "progressed",
              message: "All sets at the top of the range — up to 62.5 kg.",
              personalBest: "Heaviest set yet — 60 kg",
            }
          : {
              outcome: "hold",
              message: "Staying here until every set reaches the top of the range.",
              personalBest: null,
            },
    });
  })(),
  finishSession: ok,
  abandonSession: ok,
  refreshAfterSession: ok,
  planDay: ok,
  swapExercise: ok,
  findAlternatives: async () => ({
    ok: true as const,
    data: [
      { exerciseId: "alt1", name: "Dumbbell Bench Press", cue: "Compound push movement targeting chest. Dumbbells, Bench." },
      { exerciseId: "alt2", name: "Machine Chest Press", cue: "Compound push movement targeting chest. Chest press." },
    ],
  }),
};

const WARMUP: WarmupItem[] = [
  {
    id: "w1", slug: "easy-bike", name: "Easy stationary bike", type: "cardio",
    target_regions: [], target_muscles: ["cardio", "quads"], duration_seconds: 300,
    instructions: ["Light resistance, steady cadence."], phase: "cardio",
  },
  {
    id: "w2", slug: "band-pull-apart", name: "Band pull-apart", type: "mobility",
    target_regions: ["shoulder", "upper_back"], target_muscles: ["rear_delts", "upper_back"],
    duration_seconds: 60,
    instructions: ["Arms straight, pull the band to your chest, squeeze the shoulder blades."],
    phase: "mobility",
  },
  {
    id: "w3", slug: "band-external-rotation", name: "Band external rotation", type: "prehab",
    target_regions: ["shoulder"], target_muscles: ["rear_delts"], duration_seconds: 60,
    instructions: ["Elbow pinned to your side, rotate the forearm outward. Light band."],
    phase: "prehab",
  },
];

const EXERCISES: RunnerExercise[] = [
  {
    id: "e1", exerciseId: "x1", name: "Barbell Bench Press",
    cue: "Compound push movement targeting chest, front delts, triceps. Barbell, Bench.",
    metric: "reps",
    primaryMuscles: ["chest"], plannedSets: 4, repsMin: 8, repsMax: 12,
    restSeconds: 8, workingWeightKg: 60, suggestedWeightKg: 60,
    status: "pending", feel: null, sets: [],
  },
  {
    id: "e2", exerciseId: "x2", name: "Wide-Grip Lat Pulldown",
    cue: "Compound pull movement targeting lats. Lat pulldown.",
    metric: "reps",
    primaryMuscles: ["lats"], plannedSets: 3, repsMin: 8, repsMax: 12,
    restSeconds: 8, workingWeightKg: null, suggestedWeightKg: null,
    status: "pending", feel: null, sets: [],
  },
  // A hold, so the countdown and the seconds field can be exercised here. The
  // target is short on purpose: the harness is for driving the UI, not waiting.
  {
    id: "e3", exerciseId: "x3", name: "Plank",
    cue: "Isolation targeting abs.",
    metric: "seconds",
    primaryMuscles: ["abs"], plannedSets: 2, repsMin: 6, repsMax: 10,
    restSeconds: 8, workingWeightKg: null, suggestedWeightKg: null,
    status: "pending", feel: null, sets: [],
  },
];

/**
 * Tomorrow, for the end-of-session prompt. The planner is stubbed like every
 * other server action here, so the choices can be driven without a session.
 */
const TOMORROW = {
  localDate: "2999-01-02",
  plannedLabel: "Legs",
  days: [
    { programDayId: "d1", label: "Push", dayType: "weights" as const },
    { programDayId: "d2", label: "Pull", dayType: "weights" as const },
    { programDayId: "d3", label: "Legs", dayType: "weights" as const },
  ],
};

/**
 * The same exercises, but already finished.
 *
 * Reproduces the state a session is in when someone completes their last lift
 * and leaves before the cool-down: open, with nothing pending. Resuming that
 * used to drop the user back on exercise one and offer "How did that feel?" for
 * a lift finished an hour earlier, applying progression twice.
 */
const FINISHED: RunnerExercise[] = EXERCISES.map((e, i) => ({
  ...e,
  status: i === 1 ? ("skipped" as const) : ("completed" as const),
  feel: i === 1 ? null : ("right" as const),
  sets:
    i === 1
      ? []
      : Array.from({ length: e.plannedSets }, (_, n) => ({
          setNumber: n + 1,
          reps: e.metric === "seconds" ? null : e.repsMax,
          weightKg: e.workingWeightKg,
          durationSeconds: e.metric === "seconds" ? e.repsMax : null,
        })),
}));

export function SessionPreview() {
  const [runId, setRunId] = useState(0);
  const [exited, setExited] = useState(false);
  /*
    Modes the app ships but nothing had ever driven. Per-set logging off and
    the cool-down toggle both change the session flow, and both were listed as
    untested in QA pass 2 because exercising them on production needs a day
    with no completed session on it. They are client settings, so the harness
    can reach them even when the account cannot.
  */
  const [perSetLogging, setPerSetLogging] = useState(true);
  const [cooldownEnabled, setCooldownEnabled] = useState(true);
  const [startFinished, setStartFinished] = useState(false);

  if (exited) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">Session flow exited.</p>
          <p className="mt-2 text-sm text-muted">Persistence was stubbed — nothing was written.</p>
          <button
            onClick={() => {
              setExited(false);
              setRunId((n) => n + 1);
            }}
            className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-fg"
          >
            Run again
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="fixed top-2 right-2 z-50 flex flex-col gap-1 rounded-lg border border-border bg-surface-2/95 p-2 text-xs">
        <Mode on={perSetLogging} set={setPerSetLogging} label="Per-set logging" />
        <Mode on={cooldownEnabled} set={setCooldownEnabled} label="Cool-down" />
        <Mode on={startFinished} set={setStartFinished} label="Start finished" />
      </div>
      <SessionRunner
        // The settings are in the key so that flipping one restarts the flow
        // rather than changing the rules half way through it.
        key={`${runId}:${perSetLogging}:${cooldownEnabled}:${startFinished}`}
        sessionId="00000000-0000-0000-0000-000000000000"
        isDeload={false}
        week={2}
        warmupAlreadyDone={false}
        startedAt={null}
        warmup={WARMUP}
        exercises={startFinished ? FINISHED : EXERCISES}
        tomorrow={TOMORROW}
        settings={{
          perSetLogging,
          restAutostart: true,
          restSound: true,
          restVibrate: true,
          restOverrideSeconds: null,
          cooldownEnabled,
        }}
        actions={STUB}
        onExit={() => setExited(true)}
      />
    </>
  );
}

function Mode({
  on,
  set,
  label,
}: {
  on: boolean;
  set: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={`rounded px-2 py-1 text-left ${on ? "bg-accent text-accent-fg" : "text-muted"}`}
    >
      {label}: {on ? "on" : "off"}
    </button>
  );
}
