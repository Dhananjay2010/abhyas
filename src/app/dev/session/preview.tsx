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
  finishExercise: async () => ({
    ok: true as const,
    data: { outcome: "progressed", message: "All sets at the top of the range — up to 62.5 kg." },
  }),
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

export function SessionPreview() {
  const [runId, setRunId] = useState(0);
  const [exited, setExited] = useState(false);

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
    <SessionRunner
      key={runId}
      sessionId="00000000-0000-0000-0000-000000000000"
      isDeload={false}
      week={2}
      warmupAlreadyDone={false}
      startedAt={null}
      warmup={WARMUP}
      exercises={EXERCISES}
      tomorrow={TOMORROW}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: true,
        restVibrate: true,
        restOverrideSeconds: null,
        cooldownEnabled: true,
      }}
      actions={STUB}
      onExit={() => setExited(true)}
    />
  );
}
