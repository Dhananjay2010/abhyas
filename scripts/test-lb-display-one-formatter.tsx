#!/usr/bin/env tsx
/**
 * Test (QA2 M-1): one lb formatter for every lift weight the user sees.
 *
 * The progression banner, the session runner's working-weight line, the
 * logged-set rows and the PB toast all format lb through formatPrescribedWeight
 * (floored to 0.5 lb). The banner's "unchanged, so show the hold message"
 * decision compares those displayed strings, not raw kg.
 *
 * QA2 repros: lifting 220 lb or 165 lb shows the hold wording, not "up to
 * 220 lb"; 100 kg reads 220 lb everywhere (not 220 vs 220.5); 102.5 kg reads
 * 225.5 lb everywhere (not 225.5 vs 226). A sweep over a range of kg values
 * checks every surface against the shared formatter and that the hold decision
 * equals display equality. Everything runs the real code, including a jsdom
 * render of the real SessionRunner.
 */

import "./helpers/setup-jsdom";
import { render, waitFor, cleanup } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";
import { evaluateProgression, describePersonalBest, type Decision, type ExerciseMeta } from "../src/lib/program/progression";
import { formatPrescribedWeight, lbToKg } from "../src/lib/units";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const lb = (kg: number) => formatPrescribedWeight(kg, "imperial");
const lbKg = (pounds: number) => Math.round(lbToKg(pounds) * 100) / 100;

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

/** A top-of-range success: 4×12 at `liftedKg`, stored working weight `currentKg`. */
function successAt(liftedKg: number, currentKg: number | null): Decision {
  return evaluateProgression({
    sets: [1, 2, 3, 4].map(() => ({ reps: 12, weightKg: liftedKg })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: {
      currentWorkingWeightKg: currentKg,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
}

const HOLD_MESSAGE = "All sets at the top of the range — ready for the next step.";

const actions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => ({ ok: true as const }),
  deleteSet: async () => ({ ok: true as const }),
  finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
  finishSession: async () => ({ ok: true as const, data: { status: "completed" as const, durationSeconds: null } }),
  abandonSession: async () => ({ ok: true as const }),
  planDay: async () => ({ ok: true as const }),
  refreshAfterSession: async () => ({ ok: true as const }),
  swapExercise: async () => ({
    ok: true,
    data: {
      workoutSessionExerciseId: "",
      exerciseId: "",
      metric: "reps" as const,
      repsMin: null,
      repsMax: null,
      equipmentIds: [],
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: false,
    },
  }),
  findAlternatives: async () => ({ ok: true as const, data: [] }),
  getSessionSummary: async () => ({ ok: true as const, data: [] }),
};

/** Render the real runner (imperial) and read the working-weight line and the logged row. */
async function runnerTexts(workingKg: number, loggedKg: number): Promise<{ working: string; logged: string }> {
  const exercise: RunnerExercise = {
    id: "ex1",
    exerciseId: "bench-press",
    name: "Bench Press",
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 3,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 180,
    workingWeightKg: workingKg,
    suggestedWeightKg: workingKg,
    status: "pending",
    feel: null,
    sets: [{ setNumber: 1, weightKg: loggedKg, reps: 12, durationSeconds: null }],
    isBodyweight: false,
  };
  const r = render(
    <SessionRunner
      sessionId="s1"
      userId="test-user"
      sessionStatus="in_progress"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise]}
      settings={{
        perSetLogging: true,
        restAutostart: false,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
        units: "imperial" as const,
      }}
      actions={actions}
    />,
  );
  await waitFor(() => {
    if (!r.container.querySelector("[data-testid='working-weight-line']")) throw new Error("no working-weight line");
  }, { timeout: 5000 });
  const working = r.container.querySelector("[data-testid='working-weight-line']")?.textContent ?? "";
  const row = [...r.container.querySelectorAll("li")].find((li) => li.textContent?.includes("Set 1"));
  const logged = row?.textContent ?? "";
  r.unmount();
  cleanup();
  return { working, logged };
}

(async () => {
  console.log("\n=== QA2 M-1 repros ===\n");
  {
    // Lifted 220 lb (99.79 kg) on a lighter stored weight: next 100 kg also shows 220 lb
    const lifted = lbKg(220);
    const d = successAt(lifted, 97.5);
    check("220 lb lifted -> next 100 kg", d.nextWorkingWeightKg === 100, `got ${d.nextWorkingWeightKg}`);
    check("220 lb: hold wording (displayed weight unchanged)", d.outcome === "hold" && d.message === HOLD_MESSAGE, `${d.outcome}: ${d.message}`);
    check("220 lb: never says 'up to 220 lb'", !d.message.includes("up to 220 lb"), d.message);
  }
  {
    const lifted = lbKg(165);
    const d = successAt(lifted, 72.5);
    check("165 lb lifted -> next 75 kg", d.nextWorkingWeightKg === 75, `got ${d.nextWorkingWeightKg}`);
    check("165 lb: hold wording", d.outcome === "hold" && d.message === HOLD_MESSAGE, `${d.outcome}: ${d.message}`);
  }
  {
    check("100 kg PB toast reads 220 lb", describePersonalBest({ kind: "weight", value: 100 }, "imperial") === "Heaviest set yet — 220 lb",
      describePersonalBest({ kind: "weight", value: 100 }, "imperial"));
    const d = successAt(97.5, 97.5);
    check("97.5 -> 100 kg banner reads 'up to 220 lb'", d.message === "All sets at the top of the range — up to 220 lb.", d.message);
    const t = await runnerTexts(100, 100);
    check("100 kg runner working weight reads 220 lb", t.working === "Working weight 220 lb", t.working);
    check("100 kg logged row reads 220 lb", t.logged.includes("· 220 lb") && !t.logged.includes("220.5"), t.logged);
  }
  {
    const t = await runnerTexts(102.5, 102.5);
    check("102.5 kg runner working weight reads 225.5 lb", t.working === "Working weight 225.5 lb", t.working);
    check("102.5 kg logged row reads 225.5 lb (not 226)", t.logged.includes("· 225.5 lb"), t.logged);
    check("102.5 kg PB toast reads 225.5 lb", describePersonalBest({ kind: "weight", value: 102.5 }, "imperial") === "Heaviest set yet — 225.5 lb");
  }

  console.log("\n=== Sweep: every surface matches the shared lb formatter ===\n");
  {
    // kg-grid values plus values entered in lb (stored as 2-decimal kg)
    const values: number[] = [];
    for (let kg = 20; kg <= 160; kg += 1.25) values.push(Math.round(kg * 100) / 100);
    for (let pounds = 45; pounds <= 350; pounds += 2.5) values.push(lbKg(pounds));
    for (let kg = 20.05; kg <= 60; kg += 0.37) values.push(Math.round(kg * 100) / 100);

    let pbBad = 0;
    let bannerBad = 0;
    let holdBad = 0;
    let holds = 0;
    let progressed = 0;
    const ex: string[] = [];
    for (const v of values) {
      const want = lb(v);
      if (describePersonalBest({ kind: "weight", value: v }, "imperial") !== `Heaviest set yet — ${want}`) pbBad++;
      if (describePersonalBest({ kind: "e1rm", value: v }, "imperial") !== `Best estimated one-rep max yet — ${want}`) pbBad++;

      // Banner: success with no stored weight, so the step starts from what was lifted
      const d = successAt(v, null);
      const next = d.nextWorkingWeightKg ?? 0;
      if (next <= v) continue; // "no heavier load available" hold, not a display question
      const same = lb(next) === lb(v);
      if (same) {
        holds++;
        if (!(d.outcome === "hold" && d.message === HOLD_MESSAGE)) {
          holdBad++;
          if (ex.length < 5) ex.push(`${v}->${next}: ${d.outcome} "${d.message}"`);
        }
      } else {
        progressed++;
        if (!(d.outcome === "progressed" && d.message === `All sets at the top of the range — up to ${lb(next)}.`)) {
          bannerBad++;
          if (ex.length < 5) ex.push(`${v}->${next}: ${d.outcome} "${d.message}"`);
        }
      }
    }
    check(`${values.length} values: PB toast (weight and e1RM) == shared formatter`, pbBad === 0, `${pbBad} mismatches`);
    check(`${progressed} progressions: banner 'up to X' == shared formatter`, bannerBad === 0, ex.join("; "));
    check(`${holds} equal-display cases: hold wording exactly when displays match`, holdBad === 0, ex.join("; "));
    check("sweep hit both hold and progressed cases", holds > 0 && progressed > 0, `${holds} holds, ${progressed} progressed`);

    // Back-off banner: "dropping to X" uses the same formatter
    let backBad = 0;
    for (const v of values.filter((x) => x >= 30)) {
      const d = evaluateProgression({
        sets: [1, 2, 3, 4].map(() => ({ reps: 5, weightKg: v })),
        plannedSets: 4,
        repsMin: 8,
        repsMax: 12,
        feel: null,
        meta: BENCH,
        state: {
          currentWorkingWeightKg: v, currentTargetReps: 12, consecutiveFailures: 1, bestWeightKg: null,
          bestReps: null, bestE1rm: null, totalSessions: 3, weightAtFailureStartKg: v,
        },
        isDeload: false,
        equipmentIds: ["barbell"],
        unit: "lb",
      });
      if (d.outcome === "backed_off" && !d.message.includes(`dropping to ${lb(d.nextWorkingWeightKg ?? 0)} `)) backBad++;
    }
    check("back-off banner 'dropping to X' == shared formatter", backBad === 0, `${backBad} mismatches`);

    // Runner: a sample rendered through the real SessionRunner
    const sample = [20, 20.41, 45.36, 55, 61.23, 62.5, 62.75, 72.5, 99.79, 100, 102.5, 102.51, 105, 120.2, 137.5];
    let runBad = 0;
    for (const v of sample) {
      const t = await runnerTexts(v, v);
      if (t.working !== `Working weight ${lb(v)}` || !t.logged.includes(`· ${lb(v)}`)) {
        runBad++;
        console.log(`    runner ${v} kg: "${t.working}" / "${t.logged}" vs ${lb(v)}`);
      }
    }
    check(`${sample.length} runner renders: working-weight line and logged row == shared formatter`, runBad === 0, `${runBad} mismatches`);
  }

  console.log();
  if (failures > 0) {
    console.log(`❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("All one-lb-formatter checks passed.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
