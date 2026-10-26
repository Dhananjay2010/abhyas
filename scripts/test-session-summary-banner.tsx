#!/usr/bin/env tsx
/**
 * The REAL SessionRunner: post-exercise banner and the end-of-session summary.
 *
 * Case 1, a live session:
 *   - finishing Bench shows "Bench Press: <its note>" on the NEXT screen (Curl),
 *     not "Curl: ...";
 *   - skipping Curl clears it, so Row's screen shows no stale Bench note;
 *   - finishing Row (last, cool-down off) loads the summary through
 *     actions.getSessionSummary and renders the PB card and the note.
 * Case 2, a Resume with nothing left (cool-down screen): the summary is still
 *   fetched from the server, since the client never saw those finishes.
 *
 * Case 3, the summary's Total volume is in the user's units: 10 x 50 kg is
 *   "500 kg" for metric and "1,102 lb" for imperial (QA Bot 1 L-1).
 *
 * Kills: dropping the getSessionSummary call; labelling the banner with
 * current.name; not clearing the banner on skip.
 */
import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
  type RunnerSettings,
} from "../src/app/session/[id]/session-runner";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!pass) failures++;
}

const ok = async () => ({ ok: true }) as const;

function makeExercise(id: string, name: string, done: boolean): RunnerExercise {
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
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    // One set already logged: the screen opens on "How did that feel?".
    status: done ? "completed" : "pending",
    feel: done ? "right" : null,
    sets: [{ setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null }],
    isBodyweight: false,
  };
}

const settings: RunnerSettings = {
  perSetLogging: true,
  restAutostart: false,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: false,
};

const SUMMARY = [
  { name: "Row", message: "Weight up to 52.5 kg next time", personalBest: "Heaviest set yet — 50 kg" },
];

function makeActions() {
  const calls = { summary: 0, finishSession: 0 };
  const notes: Record<string, string> = {
    bench: "All sets at the top of the range, 52.5 kg next time",
    row: "52.5 kg next time",
  };
  const actions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async (input: { sessionExerciseId: string; skipped?: boolean }) => {
      if (input.skipped) return { ok: true as const, data: null };
      const message = notes[input.sessionExerciseId] ?? "";
      return { ok: true as const, data: { outcome: "progress", message, personalBest: null } };
    },
    finishSession: async () => {
      calls.finishSession++;
      return { ok: true as const };
    },
    getSessionSummary: async () => {
      calls.summary++;
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

async function click(el: Element | undefined, label: string) {
  if (!el) throw new Error(`button not found: ${label}`);
  await act(async () => {
    fireEvent.click(el);
    await new Promise((r) => setTimeout(r, 50));
  });
}

const totalVolume = (c: HTMLElement) =>
  [...c.querySelectorAll("span")].find((sp) => sp.textContent === "Total volume")?.nextElementSibling?.textContent ?? null;

async function finishedSummary(units?: "metric" | "imperial") {
  const { actions } = makeActions();
  const r = render(
    <SessionRunner
      sessionId="s3"
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

  console.log("Case 1: live session (finish, skip, finish last)");
  {
    const { actions, calls } = makeActions();
    const { container: c, unmount } = render(
      <SessionRunner
        sessionId="s1"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[makeExercise("bench", "Bench Press", false), makeExercise("curl", "Curl", false), makeExercise("row", "Row", false)]}
        settings={settings}
        actions={actions}
      />,
    );
    await waitFor(() => {
      if (!c.textContent?.includes("How did that feel?")) throw new Error("feel prompt not shown");
    });
    await click(button(c, /^Just right$/), "Just right (Bench)");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Curl")) throw new Error("Curl not shown");
    });
    const b1 = bannerText(c);
    check("banner on Curl's screen names Bench Press", b1?.startsWith("Bench Press:") ?? false, String(b1));
    check("banner does not name Curl", !(b1 ?? "").startsWith("Curl:"), String(b1));
    check("banner carries Bench's note", (b1 ?? "").includes("52.5 kg next time"), String(b1));

    await click(button(c, /^Skip this exercise$/), "Skip this exercise");
    await click(button(c, /^Skip it$/), "Skip it");
    await waitFor(() => {
      if (!c.querySelector("h2")?.textContent?.includes("Row")) throw new Error("Row not shown");
    });
    check("after skipping Curl, no stale banner on Row", bannerText(c) === null, String(bannerText(c)));

    await click(button(c, /^Just right$/), "Just right (Row)");
    await waitFor(() => {
      if (!c.textContent?.includes("Session complete")) throw new Error("summary not shown");
    });
    await waitFor(() => {
      if (!c.textContent?.includes("What changed for next time")) throw new Error("notes not rendered");
    }, { timeout: 2000 }).catch(() => {});
    check("finishSession called once", calls.finishSession === 1, String(calls.finishSession));
    check("getSessionSummary called on reaching done", calls.summary === 1, String(calls.summary));
    check("'What changed for next time' rendered", c.textContent?.includes("What changed for next time") ?? false);
    check("note from the server rendered", c.textContent?.includes("Weight up to 52.5 kg next time") ?? false);
    check("PB card rendered", (c.textContent?.includes("Personal best") ?? false) && (c.textContent?.includes("Heaviest set yet — 50 kg") ?? false));
    unmount();
  }

  console.log("\nCase 2: Resume with nothing pending (cool-down screen), then finish");
  {
    const { actions, calls } = makeActions();
    const { container: c, unmount } = render(
      <SessionRunner
        sessionId="s2"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[makeExercise("row", "Row", true)]}
        settings={settings}
        actions={actions}
      />,
    );
    await click(button(c, /^Skip cool-down$/), "Skip cool-down");
    await waitFor(() => {
      if (!c.textContent?.includes("Session complete")) throw new Error("summary not shown");
    });
    await waitFor(() => {
      if (!c.textContent?.includes("What changed for next time")) throw new Error("notes not rendered");
    }, { timeout: 2000 }).catch(() => {});
    check("getSessionSummary called after resume", calls.summary === 1, String(calls.summary));
    check("summary rendered from the server after resume", c.textContent?.includes("Weight up to 52.5 kg next time") ?? false);
    unmount();
  }

  console.log("\nCase 3: Total volume in the user's units");
  {
    const imp = await finishedSummary("imperial");
    const v1 = totalVolume(imp.container);
    check("imperial user: Total volume in lb (500 kg = 1,102 lb)", v1 === "1,102 lb", String(v1));
    imp.unmount();
    const met = await finishedSummary("metric");
    const v2 = totalVolume(met.container);
    check("metric user: Total volume in kg", v2 === "500 kg", String(v2));
    met.unmount();
    const dflt = await finishedSummary(undefined);
    const v3 = totalVolume(dflt.container);
    check("no units passed: defaults to kg", v3 === "500 kg", String(v3));
    dflt.unmount();
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
