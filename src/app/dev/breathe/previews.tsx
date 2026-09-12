"use client";

import { useMemo, useRef } from "react";
import { BreatheHome, type LastPractice } from "@/app/breathe/breathe-home";
import { PracticeSetup } from "@/app/breathe/[slug]/practice-setup";
import { BreathingSession } from "@/app/breathe/[slug]/session/breathing-session";
import { CustomPatternForm } from "@/app/breathe/new/custom-pattern-form";
import type { BreathPhase } from "@/lib/breathing/engine";
import type { BreathingPrefs, Intent, Pattern, SessionOptions } from "@/lib/breathing/pattern";
import type { BreathingStats, CalmShift } from "@/lib/breathing/stats";
import type { Suggestion } from "@/lib/breathing/suggest";
import type { PatternDraft, PracticeInput } from "@/lib/breathing/validation";

/**
 * The real breathing components with the server actions stubbed.
 *
 * Every stub logs what it was handed, so the payload the real action would
 * receive can be read from the console. They also wait a little, because an
 * instant stub hides every "Saving…" state and every double-tap bug.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const log = async (name: string, payload: unknown) => {
  console.info(`[breathe harness] ${name}`, JSON.stringify(payload));
  await wait(250);
};

const updateBreathingPrefs = async (patch: unknown) => {
  await log("updateBreathingPrefs", patch);
  return { ok: true } as const;
};

const savePatternTiming = async (input: { basePatternId: string; draft: PatternDraft }) => {
  await log("savePatternTiming", input);
  return { ok: true } as const;
};

const resetPatternTiming = async (basePatternId: string) => {
  await log("resetPatternTiming", { basePatternId });
  return { ok: true } as const;
};

const saveCustomPattern = async (input: { id?: string; draft: PatternDraft }) => {
  await log("saveCustomPattern", input);
  // The fixture's own practice, so saving a new one lands on a page that
  // exists here rather than on an id nothing in the harness knows.
  return { ok: true, data: { id: input.id ?? "00000000-0000-4000-9000-000000000001" } } as const;
};

const deleteCustomPattern = async (id: string) => {
  await log("deleteCustomPattern", { id });
  return { ok: true } as const;
};

const SETUP_ACTIONS = {
  updateBreathingPrefs,
  savePatternTiming,
  resetPatternTiming,
  saveCustomPattern,
};

export function HomePreview(props: {
  patterns: Pattern[];
  prefs: BreathingPrefs;
  stats: BreathingStats;
  last: LastPractice | null;
  lastCyclesByPattern: Record<string, number>;
  suggestion: Suggestion | null;
  shifts: CalmShift[];
  intent: Intent | null;
  todayIndex: number;
}) {
  return <BreatheHome {...props} basePath="/dev/breathe" actions={{ updateBreathingPrefs }} />;
}

export function SetupPreview(props: {
  pattern: Pattern;
  prefs: BreathingPrefs;
  lastCycles: number | null;
  firstPractice: boolean;
}) {
  return <PracticeSetup {...props} basePath="/dev/breathe" actions={SETUP_ACTIONS} />;
}

export function NewPreview({
  existing,
}: {
  existing?: { id: string; name: string; phases: BreathPhase[] };
}) {
  return (
    <CustomPatternForm
      existing={existing}
      basePath="/dev/breathe"
      actions={{ saveCustomPattern, deleteCustomPattern }}
    />
  );
}

export function SessionPreview({
  failFirst,
  ...props
}: {
  pattern: Pattern;
  options: SessionOptions;
  week: { days: boolean[]; seconds: number };
  todayIndex: number;
  /** Make the first save fail, to exercise the retry. */
  failFirst: boolean;
}) {
  const failuresLeft = useRef(failFirst ? 1 : 0);
  const actions = useMemo(
    () => ({
      recordBreathingPractice: async (input: PracticeInput) => {
        await log("recordBreathingPractice", input);
        await wait(150);
        if (failuresLeft.current > 0) {
          failuresLeft.current -= 1;
          return { ok: false, error: "The harness is set to fail the first save." } as const;
        }
        return { ok: true } as const;
      },
      rateBreathingPractice: async (input: { logId: string; moodAfter: number }) => {
        await log("rateBreathingPractice", input);
        return { ok: true } as const;
      },
    }),
    [],
  );
  return <BreathingSession {...props} homeHref="/dev/breathe" actions={actions} />;
}
