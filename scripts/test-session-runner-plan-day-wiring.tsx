#!/usr/bin/env tsx
/**
 * MED-2 runner wiring test (QA3 r3 mutant Q4): render the REAL SessionRunner,
 * finish the session through the real cool-down button, and answer the real
 * "What about tomorrow?" prompt on the summary. The planDay call the runner
 * makes must carry the session's id (so the server resolves
 * session.local_date + 1) and must NOT carry the page's tomorrow.localDate.
 *
 *   npx tsx scripts/test-session-runner-plan-day-wiring.tsx
 */
import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerTimer } from "../src/app/session/[id]/session-runner";
import type { DayPlan } from "../src/app/session/actions";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const timer: RunnerTimer = {
  setTimeout: (cb: () => void, ms: number) => globalThis.setTimeout(cb, Math.min(ms, 5)),
  clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),
};

const doneExercise: RunnerExercise = {
  id: "se1",
  exerciseId: "ex-1",
  name: "Bench Press",
  cue: null,
  metric: "reps",
  primaryMuscles: [],
  plannedSets: 1,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
  workingWeightKg: 60,
  suggestedWeightKg: 60,
  status: "completed",
  feel: "good" as RunnerExercise["feel"],
  sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null, isWarmupSet: false, completedAt: "2026-10-28T16:00:00.000Z" }] as unknown as RunnerExercise["sets"],
  isBodyweight: false,
};

type PlanCall = { sessionId?: string; localDate?: string; plan: DayPlan };

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}

const btn = (c: HTMLElement, re: RegExp) =>
  [...c.querySelectorAll("button")].find((b) => re.test(b.textContent?.trim() ?? ""));

async function runCase(plannedLabel: string, answer: RegExp, programDayId: string | null = null, expectPlan: DayPlan = { kind: "keep" }) {
  const calls: PlanCall[] = [];
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 3000 } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: null, currentTargetReps: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async (input: PlanCall) => { calls.push(input); return { ok: true }; },
    getSessionSummary: async () => ({ ok: true, data: [] }),
  } as unknown as SessionActions;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-runner-1",
        userId: "u1",
        sessionStatus: "in_progress" as const,
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date(Date.now() - 3600_000).toISOString(),
        warmup: [],
        cooldown: [],
        exercises: [doneExercise],
        settings: { perSetLogging: true, restAutostart: false, restSound: false, restVibrate: false, restOverrideSeconds: null, cooldownEnabled: true, units: "metric" as const },
        tomorrow: {
          localDate: "2026-10-31", // deliberately NOT what the server would resolve
          plannedLabel,
          programDayId,
          dayType: plannedLabel === "Rest" ? "rest" : plannedLabel === "Yoga" ? "yoga" : "weights",
          collisionResolved: programDayId !== null,
          days: [{ programDayId: "pd-upper", label: "Upper", dayType: "weights" }],
        },
        actions,
        timer,
      }),
    );
  });
  await flush();

  const finish = btn(container, /^Skip cool-down$/) ?? btn(container, /Finish/);
  check("cool-down finish button present", !!finish, (container.textContent ?? "").slice(0, 160));
  await act(async () => { finish?.click(); });
  await flush();

  const text = container.textContent ?? "";
  check("summary shows the tomorrow prompt", text.includes("What about tomorrow?"), text.slice(0, 200));
  const choice = btn(container, answer);
  check(`prompt offers ${answer}`, !!choice);
  await act(async () => { choice?.click(); });
  await flush();

  check("planDay called exactly once", calls.length === 1, JSON.stringify(calls));
  check("planDay gets the session id", calls[0]?.sessionId === "sess-runner-1", JSON.stringify(calls[0]));
  check("planDay does NOT get tomorrow.localDate", calls[0] !== undefined && !("localDate" in calls[0]) , JSON.stringify(calls[0]));
  check(`plan is ${JSON.stringify(expectPlan)}`, JSON.stringify(calls[0]?.plan) === JSON.stringify(expectPlan), JSON.stringify(calls[0]?.plan));

  await act(async () => { root.unmount(); });
  container.remove();
}

(async () => {
  console.log("R1: tomorrow is a rest day -> Keep rest");
  await runCase("Rest", /^Keep rest$/);
  console.log("\nR2: tomorrow is Upper -> Keep it");
  await runCase("Upper", /^Keep it$/);
  console.log("\nR3: #165 collision-resolved tomorrow (Lower, pd-lower) -> Keep it sends that day, still by sessionId");
  await runCase("Lower", /^Keep it$/, "pd-lower", { kind: "training", programDayId: "pd-lower" });

  if (failures > 0) {
    console.log(`\n❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All session runner planDay wiring checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("CRASH", e);
  process.exit(2);
});
