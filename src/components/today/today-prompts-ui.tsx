/**
 * Presentational component for Today prompts.
 * Extracted from today-prompts.tsx to enable render testing.
 */

import Link from "next/link";
import { labelForDayType } from "@/lib/program/day-plan";
import type { PromptBlocks } from "@/lib/today/prompt-blocks";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

type Props = {
  promptBlocks: PromptBlocks;
  yesterdayDay: { day_type: DayType; label: string | null } | null;
};

/**
 * Presentational-only prompts for testing.
 * Only renders the 'both' prompt state (showBothPrompt).
 */
export function TodayPromptsBothUI({ promptBlocks, yesterdayDay }: Props) {
  if (!promptBlocks.showBothPrompt) {
    return null;
  }

  return (
    <>
      <p className="mt-6 text-muted">
        Rest is part of the training. Your body builds strength while recovering.
      </p>
      <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5">
        <h3 className="font-semibold">Active recovery</h3>
        <p className="mt-1 text-sm text-muted">
          Light movement helps recovery: a 20-minute walk, gentle yoga, or mobility work.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/yoga"
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Yoga
          </Link>
          <Link
            href="/breathe"
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Breathe
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <h3 className="font-semibold">
          You missed yesterday: {labelForDayType(
            yesterdayDay?.day_type ?? "rest",
            yesterdayDay?.label ?? null,
          )} did not happen.
        </h3>
      </div>
    </>
  );
}
