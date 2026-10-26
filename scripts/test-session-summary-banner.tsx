#!/usr/bin/env tsx
/**
 * The REAL SessionRunner: post-exercise banner and the end-of-session summary.
 *
 * "What changed for next time" (APP decision on M-1) shows ONLY the progression
 * messages finishExercise returned during this mount -- the exact strings the
 * banner showed, one per exercise in order. After a remount there is nothing
 * collected, so the section is absent; it is never rebuilt from the database.
 * Personal bests still come from getSessionSummary (the DB loader).
 *
 * The finishExercise stub returns messages made by the REAL progression engine
 * (evaluateProgression) for the logged sets, so the strings are the engine's.
 *
 * Case 1, a live session: Bench is QA Bot 1's repro (prescribed 40 kg, lifted
 *   62.5 kg -> "Staying ..."); Curl is skipped; Row progresses.
 *   - the banner on the next screen names the finished exercise;
 *   - the summary lists exactly [Bench: <banner text>, Row: <banner text>];
 *   - the skipped Curl contributes no note.
 * Case 1b, two exercises back to back: each note is its own exercise's message.
 * Case 2, a deload week: both notes are the engine's deload message, equal to
 *   what the banner showed.
 * Case 3, a remount with nothing pending (cool-down screen): no collected
 *   messages, so no "What changed" section even though the server answer
 *   carries an old-style message; the PB card still shows.
 * Case 4, Total volume in the user's units.
 * Cases 5 and 6, the summary fetch rejects / returns ok:false: an error with
 *   Retry, and Retry renders the PB card (QA3 MED-2).
 */
import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
  type RunnerSettings,
} from "../src/app/session/[id]/session-runner";
import { evaluateProgression, type ProgressState } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!pass) failures++;
}

const ok = async () => ({ ok: true }) as const;

type Logged = { reps: number; weightKg: number };

function makeExercise(id: string, name: string, done: boolean, set: Logged = { reps: 10, weightKg: 50 }): RunnerExercise {
  return {
    id,
    exerciseId: `${id}-ex`,
    name,
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 1,
    repsMin: 8,
    repsMax: 12,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    restSeconds: 60,
    workingWeightKg: 40,
    suggestedWeightKg: 40,
    // One set already logged: the screen opens on "How did that feel?".
    status: done ? "completed" : "pending",
    feel: done ? "right" : null,
    sets: [{ setNumber: 1, reps: set.reps, weightKg: set.weightKg, durationSeconds: null }],
    isBodyweight: false,
  };
}

/** The engine's message for one logged set against a 40 kg prescription. */
function engineMessage(set: Logged, isDeload: boolean): string {
  const state: ProgressState = {
    currentWorkingWeightKg: 40, currentTargetReps: 12, consecutiveFailures: 0,
    bestWeightKg: 40, bestReps: 10, bestE1rm: 50, totalSessions: 3,
  };
  return evaluateProgression({
    sets: [{ reps: set.reps, weightKg: set.weightKg }],
    plannedSets: 1, repsMin: 8, repsMax: 12, feel: "right",
    meta: { mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null },
    state, isDeload,
  }).message;
}

const settings: RunnerSettings = {
  perSetLogging: true,
  restAutostart: false,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: false,
  units: "metric",
};

// What getSessionSummary returns: PBs. The extra old-style `message` is what a
// DB-derived note would be; it must never be shown.
const SUMMARY = [
  { name: "Row", personalBest: "Heaviest set yet — 50 kg", message: "Weight down next time" },
];

type SummaryResult = { ok: true; data: typeof SUMMARY } | { ok: false; error: string };

function makeActions(messages: Record<string, string>, summaryImpl?: (call: number) => Promise<SummaryResult>) {
  const calls = { summary: 0, finishSession: 0 };
  const actions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async (input: { sessionExerciseId: string; skipped?: boolean }) => {
      // Even if the server sent a message for a skip, the runner must not show it.
      const message = messages[input.sessionExerciseId] ?? "";
      return { ok: true as const, data: { outcome: "hold", message, personalBest: null } };
    },
    finishSession: async () => {
      calls.finishSession++;
      return { ok: true as const };
    },
    getSessionSummary: async () => {
      calls.summary++;
      if (summaryImpl) return summaryImpl(calls.summary);
      return { ok: true as const, data: SUMMARY };
    },
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: ok,
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;
  return { actions, calls };
}

const button = (c: HTMLElement, re: RegExp) =>
  [...c.querySelectorAll("button")].find((b) => re.test(b.textContent?.trim() ?? ""));

const bannerText = (c: HTMLElement) =>
  [...c.querySelectorAll("p")].find((p) => p.className.includes("bg-success/10"))?.textContent ?? null;

/** The "What changed for next time" rows as "Name: message", or null if absent. */
function changedRows(c: HTMLElement): string[] | null {
  const h2 = [...c.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "What changed for next time");
  if (!h2) return null;
  return [...(h2.parentElement?.querySelectorAll("li") ?? [])].map(
    (li) => `${li.querySelector("span")?.textContent ?? ""}: ${li.querySelector("p")?.textContent ?? ""}`,
  );
}

const totalVolume = (c: HTMLElement) =>
  [...c.querySelectorAll("span")].find((sp) => sp.textContent === "Total volume")?.nextElementSibling?.textContent ?? null;

async function click(el: Element | undefined, label: string) {
  if (!el) throw new Error(`button not found: ${label}`);
  await act(async () => {
    fireEvent.click(el);
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function waitText(c: HTMLElement, text: string, timeout = 2000) {
  await waitFor(() => {
    if (!c.textContent?.includes(text)) throw new Error(`not shown: ${text}`);
  }, { timeout }).catch(() => {});
}

async function resumedSummary(actions: SessionActions, units?: "metric" | "imperial") {
  const r = render(
    <SessionRunner
      sessionId="s-resume"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[makeExercise("row", "Row", true)]}
      settings={settings}
      units={units}
      actions={actions}
    />,
  );
  await click(button(r.container, /^Skip cool-down$/), "Skip cool-down");
  await waitFor(() => {
    if (!r.container.textContent?.includes("Session complete")) throw new Error("summary not shown");
  });
  return r;
}

(async () => {
  console.log("Session runner banner + summary\n");

  const BENCH_SET = { reps: 10, weightKg: 62.5 }; // QA Bot 1 repro: prescribed 40, lifted 62.5
  const ROW_SET = { reps: 12, weightKg: 40 };     // top of the range at 40: progresses
  const benchMsg = engineMessage(BENCH_SET, false);
  const rowMsg = engineMessage(ROW_SET, false);
  const deloadMsg = engineMessage(BENCH_SET, true);
  console.log("Engine messages");
  check("QA1 repro: the engine says 'Staying'", benchMsg.startsWith("Staying"), benchMsg);
  check("Row: a different message", rowMsg !== benchMsg && rowMsg.length > 0, rowMsg);
  check("deload: the engine's deload message", deloadMsg.startsWith("Deload week"), deloadMsg);

  console.log("\nCase 1: live session (finish Bench, skip Curl, finish Row)");
  {
    const { actions, calls } = makeActions({ bench: benchMsg, curl: "CURL MESSAGE", row: rowMsg });
    const { container: c, unmount } = render(
      <SessionRunner
        sessionId="s1"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[
          makeExercise("bench", "Bench Press", false, BENCH_SET),
          makeExercise("curl", "Curl", false),
          makeExercise("row", "Row", false, ROW_SET),
        ]}
        settings={settings}
        actions={actions}
      />,
    );
    await waitText(c, "How did that feel?");
    await click(button(c, /^Just right$/), "Just right (Bench)");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Curl")) throw new Error("Curl not shown");
    });
    const b1 = bannerText(c);
    check("banner on Curl's screen is 'Bench Press: <engine message>'", b1 === `Bench Press: ${benchMsg}`, String(b1));

    await click(button(c, /^Skip this exercise$/), "Skip this exercise");
    await click(button(c, /^Skip it$/), "Skip it");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Row")) throw new Error("Row not shown");
    });
    check("after skipping Curl, no stale banner on Row", bannerText(c) === null, String(bannerText(c)));

    await click(button(c, /^Just right$/), "Just right (Row)");
    await waitText(c, "Session complete");
    await waitText(c, "Personal best");
    check("finishSession called once", calls.finishSession === 1, String(calls.finishSession));
    check("getSessionSummary called on reaching done", calls.summary === 1, String(calls.summary));
    const rows = changedRows(c);
    check("'What changed' is exactly the banner messages, in order",
      JSON.stringify(rows) === JSON.stringify([`Bench Press: ${benchMsg}`, `Row: ${rowMsg}`]), JSON.stringify(rows));
    check("QA1 repro: summary says 'Staying', same as the banner", (rows ?? [])[0] === b1, `${(rows ?? [])[0]} vs ${b1}`);
    check("skipped Curl contributes no note", !(rows ?? []).some((r) => r.startsWith("Curl")) && !c.textContent?.includes("CURL MESSAGE"));
    check("no DB-derived note shown", !c.textContent?.includes("Weight down next time"));
    check("PB card from the server rendered", c.textContent?.includes("Heaviest set yet — 50 kg") ?? false);
    unmount();
  }

  console.log("\nCase 1b: back-to-back finishes keep each exercise's own message");
  {
    const { actions } = makeActions({ bench: benchMsg, row: rowMsg });
    const { container: c, unmount } = render(
      <SessionRunner
        sessionId="s1b"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[makeExercise("bench", "Bench Press", false, BENCH_SET), makeExercise("row", "Row", false, ROW_SET)]}
        settings={settings}
        actions={actions}
      />,
    );
    await waitText(c, "How did that feel?");
    await click(button(c, /^Just right$/), "Just right (Bench)");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Row")) throw new Error("Row not shown");
    });
    await click(button(c, /^Just right$/), "Just right (Row)");
    await waitText(c, "What changed for next time");
    const rows = changedRows(c);
    check("rows are [Bench: its message, Row: its message]",
      JSON.stringify(rows) === JSON.stringify([`Bench Press: ${benchMsg}`, `Row: ${rowMsg}`]), JSON.stringify(rows));
    unmount();
  }

  console.log("\nCase 2: deload week, notes equal the banner's deload message");
  {
    const { actions } = makeActions({ bench: deloadMsg, row: deloadMsg });
    const { container: c, unmount } = render(
      <SessionRunner
        sessionId="s2"
        isDeload={true}
        week={4}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[makeExercise("bench", "Bench Press", false, BENCH_SET), makeExercise("row", "Row", false, ROW_SET)]}
        settings={settings}
        actions={actions}
      />,
    );
    await waitText(c, "How did that feel?");
    await click(button(c, /^Just right$/), "Just right (Bench)");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Row")) throw new Error("Row not shown");
    });
    const b = bannerText(c);
    check("banner shows the deload message", b === `Bench Press: ${deloadMsg}`, String(b));
    await click(button(c, /^Just right$/), "Just right (Row)");
    await waitText(c, "Session complete");
    await waitText(c, "What changed for next time");
    const rows = changedRows(c);
    check("summary rows are the deload messages, not 'Weight up'",
      JSON.stringify(rows) === JSON.stringify([`Bench Press: ${deloadMsg}`, `Row: ${deloadMsg}`]), JSON.stringify(rows));
    check("first summary row equals the banner text", (rows ?? [])[0] === b);
    unmount();
  }

  console.log("\nCase 3: remount with nothing pending (cool-down screen): no 'What changed', PB still shown");
  {
    const { actions, calls } = makeActions({});
    const { container: c, unmount } = await resumedSummary(actions);
    await waitText(c, "Personal best");
    check("getSessionSummary called after resume", calls.summary === 1, String(calls.summary));
    check("'What changed for next time' section absent", changedRows(c) === null, JSON.stringify(changedRows(c)));
    check("no DB-derived note shown", !c.textContent?.includes("Weight down next time"));
    check("PB card still shown", c.textContent?.includes("Heaviest set yet — 50 kg") ?? false);
    unmount();
  }

  console.log("\nCase 4: Total volume in the user's units");
  {
    const imp = await resumedSummary(makeActions({}).actions, "imperial");
    check("imperial user: Total volume in lb (500 kg = 1,102 lb)", totalVolume(imp.container) === "1,102 lb", String(totalVolume(imp.container)));
    imp.unmount();
    const met = await resumedSummary(makeActions({}).actions, "metric");
    check("metric user: Total volume in kg", totalVolume(met.container) === "500 kg", String(totalVolume(met.container)));
    met.unmount();
    const dflt = await resumedSummary(makeActions({}).actions, undefined);
    check("no units passed: defaults to kg", totalVolume(dflt.container) === "500 kg", String(totalVolume(dflt.container)));
    dflt.unmount();
  }

  for (const [label, firstFailure] of [
    ["Case 5: summary fetch rejects (network drop), Retry succeeds", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["Case 6: summary fetch returns ok:false, Retry succeeds", async () => ({ ok: false as const, error: "Could not load session summary" })],
  ] as Array<[string, () => Promise<SummaryResult>]>) {
    console.log(`\n${label}`);
    const { actions, calls } = makeActions({}, (n) => (n === 1 ? firstFailure() : Promise.resolve({ ok: true as const, data: SUMMARY })));
    const { container: c, unmount } = await resumedSummary(actions);
    let alertText: string | null = null;
    await waitFor(() => {
      alertText = c.querySelector('[role="alert"]')?.textContent ?? null;
      if (!alertText?.includes("Couldn't load your summary")) throw new Error("no error shown");
    }, { timeout: 2000 }).catch(() => {});
    check("error message shown", (alertText ?? "").includes("Couldn't load your summary"), String(alertText));
    const retry = button(c, /^Retry$/);
    check("Retry button shown", !!retry);
    check("no PB card while failed", !(c.textContent?.includes("Personal best") ?? false));
    if (retry) await click(retry, "Retry");
    await waitText(c, "Personal best");
    check("Retry calls getSessionSummary again", calls.summary === 2, String(calls.summary));
    check("after Retry the PB card renders", c.textContent?.includes("Heaviest set yet — 50 kg") ?? false);
    check("after Retry the error is gone", !c.querySelector('[role="alert"]')?.textContent?.includes("Couldn't load"));
    unmount();
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All banner/summary checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
