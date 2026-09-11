"use client";

import { useMemo, useRef } from "react";
import { BreatheHome, type LastPractice } from "@/app/breathe/breathe-home";
import { PracticeSetup } from "@/app/breathe/[slug]/practice-setup";
import { BreathingSession } from "@/app/breathe/[slug]/session/breathing-session";
import type { BreathingPrefs, Intent, Pattern, SessionOptions } from "@/lib/breathing/pattern";
import type { BreathingStats } from "@/lib/breathing/stats";
import type { PracticeInput } from "@/lib/breathing/validation";

/**
 * The real breathing components with the server actions stubbed.
 *
 * Every stub logs what it was handed, so the payload the real action would
 * receive can be read from the console. They also wait a little, because an
 * instant stub hides every "Saving…" state and every double-tap bug.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const updateBreathingPrefs = async (patch: unknown) => {
  console.info("[breathe harness] updateBreathingPrefs", JSON.stringify(patch));
  await wait(250);
  return { ok: true } as const;
};

export function HomePreview(props: {
  patterns: Pattern[];
  prefs: BreathingPrefs;
  stats: BreathingStats;
  last: LastPractice | null;
  lastCyclesByPattern: Record<string, number>;
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
  return <PracticeSetup {...props} basePath="/dev/breathe" actions={{ updateBreathingPrefs }} />;
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
        console.info("[breathe harness] recordBreathingPractice", JSON.stringify(input));
        await wait(400);
        if (failuresLeft.current > 0) {
          failuresLeft.current -= 1;
          return { ok: false, error: "The harness is set to fail the first save." } as const;
        }
        return { ok: true } as const;
      },
      rateBreathingPractice: async (input: { logId: string; moodAfter: number }) => {
        console.info("[breathe harness] rateBreathingPractice", JSON.stringify(input));
        await wait(200);
        return { ok: true } as const;
      },
    }),
    [],
  );
  return <BreathingSession {...props} homeHref="/dev/breathe" actions={actions} />;
}
