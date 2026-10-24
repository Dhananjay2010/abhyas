import Link from "next/link";
import { DayPlanPrompt } from "@/components/day-plan-prompt";
import { StartFirstSessionButton } from "./start-first-session-button";
import { labelForDayType } from "@/lib/program/day-plan";
import type { PromptBlocks } from "@/lib/today/prompt-blocks";
import type { Database } from "@/lib/database.types";
import type { PlannableDay } from "@/app/session/actions";

type DayType = Database["public"]["Enums"]["day_type"];

type Props = {
  promptBlocks: PromptBlocks;
  localToday: string;
  dayLabel: string;
  plannable: PlannableDay[];
  trainAnywayDays: PlannableDay[];
  yesterdayDay: { day_type: DayType; label: string | null } | null;
  nextTraining: { dayName: string; dayIndex: number } | null;
  isTraining: boolean;
  firstTrainingDay: { dayIndex: number; dayType: DayType; label: string | null; programDayId: string } | null;
};

export function TodayPrompts({
  promptBlocks,
  localToday,
  dayLabel,
  plannable,
  trainAnywayDays,
  yesterdayDay,
  nextTraining,
  isTraining,
  firstTrainingDay,
}: Props) {
  return (
    <>
      {/* Missed-yesterday prompt (not on a rest day) */}
      {promptBlocks.showMissedPrompt && (
        <DayPlanPrompt
          localDate={localToday}
          dayLabel="Today"
          plannedLabel={dayLabel}
          days={plannable}
          heading="You missed yesterday"
          intro={`${labelForDayType(
            yesterdayDay?.day_type ?? "rest",
            yesterdayDay?.label ?? null,
          )} did not happen.`}
        />
      )}

      {/* Rest day with missed yesterday: unified prompt */}
      {promptBlocks.showBothPrompt && (
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
          <DayPlanPrompt
            localDate={localToday}
            dayLabel="Today"
            plannedLabel="Rest"
            days={trainAnywayDays}
            heading={`You missed yesterday: ${labelForDayType(
              yesterdayDay?.day_type ?? "rest",
              yesterdayDay?.label ?? null,
            )} did not happen.`}
            hideKeepAndRest={true}
          />
        </>
      )}

      {/* First-day welcome on a training day */}
      {promptBlocks.showFirstDayWelcome && isTraining && (
        <div className="mb-4 rounded-xl border border-border bg-surface-2 p-5">
          <h3 className="font-semibold">Welcome to your first workout!</h3>
          <p className="mt-2 text-sm text-muted">
            Ready to begin? Start your first training session below.
          </p>
        </div>
      )}

      {/* Rest day content (without missed yesterday) */}
      {promptBlocks.showRestPlan && !promptBlocks.showBothPrompt && (
        <>
          {promptBlocks.showFirstSessionOffer && firstTrainingDay ? (
            // NEW: First-session offer for brand-new user on rest day
            // Show "Your first session is <day 1 label>" with "Start it now" button that starts plan day 1
            <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5">
              <h3 className="font-semibold">
                Your first session is {firstTrainingDay.label || "Day 1"}
              </h3>
              <p className="mt-2 text-sm text-muted">
                Today is a rest day in your block. Start your first training session now.
              </p>
              <StartFirstSessionButton
                localDate={localToday}
                programDayId={firstTrainingDay.programDayId}
                label="Start it now"
              />
            </div>
          ) : promptBlocks.showFirstDayWelcome && nextTraining ? (
            // First day on a rest day: show next training day
            <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5">
              <h3 className="font-semibold">Your first session is {nextTraining.dayName}</h3>
              <p className="mt-2 text-sm text-muted">
                Today is a rest day in your block. You can wait until {nextTraining.dayName}, or start your first workout anyway.
              </p>
              <DayPlanPrompt
                localDate={localToday}
                dayLabel="Today"
                plannedLabel="Rest"
                days={trainAnywayDays}
                heading="Start one now"
                intro="Start your first session now."
                isRestDay={true}
              />
            </div>
          ) : (
            // Normal rest day
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
              <DayPlanPrompt
                localDate={localToday}
                dayLabel="Today"
                plannedLabel="Rest"
                days={trainAnywayDays}
                heading="Or train today anyway"
                intro="Pick a workout."
                isRestDay={true}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
