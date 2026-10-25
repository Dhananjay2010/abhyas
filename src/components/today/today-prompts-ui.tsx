/**
 * Presentational component for Today "both" prompt (rest + missed).
 * Shared between TodayPrompts and tests.
 * Pure UI component without Next.js dependencies for testing.
 */

import Link from "next/link";
import type { Database } from "@/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

type Props = {
  yesterdayDay: { day_type: DayType; label: string | null } | null;
  renderDayPlanPrompt?: () => React.ReactNode;
};

/**
 * Rest day with missed yesterday: unified prompt.
 * Renders rest content + missed heading.
 * Optionally renders DayPlanPrompt via callback to avoid Next.js dependency in tests.
 */
export function TodayPromptsBothUI({ yesterdayDay: _yesterdayDay, renderDayPlanPrompt }: Props) {
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
        {renderDayPlanPrompt && renderDayPlanPrompt()}
      </div>
    </>
  );
}
