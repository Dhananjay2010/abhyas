import Link from "next/link";
import { DayPlanPrompt } from "@/components/day-plan-prompt";
import { WelcomeCard } from "@/components/welcome-card";
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
  yesterdayDay: { day_type: DayType; label: string | null } | null;
  nextTraining: { dayName: string; dayIndex: number } | null;
  isTraining: boolean;
  program: {
    block_number: number;
    started_on: string;
    ends_on: string;
    deload_week: number | null;
  };
  days: Array<{ day_index: number; day_type: DayType }> | null;
  profile: { preferred_session_minutes: number | null };
  hasStartedAny: boolean;
  hasDismissedWelcome: boolean;
  dayType: DayType | null;
  ownsPlannedWorkout: (dt: DayType | null) => boolean;
  daysBetween: (a: string, b: string) => number;
  shouldShowWelcome: (hasStarted: boolean, dismissed: boolean) => boolean;
};

export function TodayPrompts({
  promptBlocks,
  localToday,
  dayLabel,
  plannable,
  yesterdayDay,
  nextTraining,
  isTraining,
  program,
  days,
  profile,
  hasStartedAny,
  hasDismissedWelcome,
  dayType,
  ownsPlannedWorkout,
  daysBetween,
  shouldShowWelcome,
}: Props) {
  return (
    <>
      {/* Welcome card - shown once after onboarding, before first session */}
      {shouldShowWelcome(hasStartedAny, hasDismissedWelcome) && (
        <WelcomeCard
          blockNumber={program.block_number}
          daysPerWeek={days?.filter((d) => ownsPlannedWorkout(d.day_type)).length ?? 0}
          weekSchedule={[
            { dayName: "Mon", isTraining: days?.some((d) => d.day_index === 1 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Tue", isTraining: days?.some((d) => d.day_index === 2 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Wed", isTraining: days?.some((d) => d.day_index === 3 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Thu", isTraining: days?.some((d) => d.day_index === 4 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Fri", isTraining: days?.some((d) => d.day_index === 5 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Sat", isTraining: days?.some((d) => d.day_index === 6 && ownsPlannedWorkout(d.day_type)) ?? false },
            { dayName: "Sun", isTraining: days?.some((d) => d.day_index === 7 && ownsPlannedWorkout(d.day_type)) ?? false },
          ]}
          sessionMinutes={profile.preferred_session_minutes ?? 60}
          blockLength={Math.round((daysBetween(program.started_on, program.ends_on) + 1) / 7)}
          deloadWeek={program.deload_week ?? 4}
        />
      )}

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
            days={plannable}
            heading={`You missed yesterday: ${labelForDayType(
              yesterdayDay?.day_type ?? "rest",
              yesterdayDay?.label ?? null,
            )} did not happen.`}
            isRestDay={true}
          />
        </>
      )}

      {/* First-day welcome on a training day */}
      {promptBlocks.showFirstDayWelcome && isTraining && !shouldShowWelcome(hasStartedAny, hasDismissedWelcome) && (
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
          {promptBlocks.showFirstDayWelcome && nextTraining ? (
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
                days={plannable}
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
                days={plannable}
                heading="Or train today anyway"
                intro="Pick a workout."
                isRestDay={true}
              />
            </>
          )}
        </>
      )}

      {dayType === "meditation" && (
        <div className="mt-6">
          <p className="text-muted">A breathing day. Pick a practice and sit with it.</p>
          <Link
            href="/breathe"
            className="mt-5 block rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Start breathing
          </Link>
        </div>
      )}
    </>
  );
}
