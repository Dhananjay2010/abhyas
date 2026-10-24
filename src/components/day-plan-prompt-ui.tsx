/**
 * Pure UI components for DayPlanPrompt, extracted for testing.
 * 
 * These components render the choice UI without router or action dependencies.
 */

import type { PlannableDay } from "@/app/session/actions";

function Choice({
  wide,
  disabled,
  onClick,
  children,
}: {
  wide?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`${wide ? "w-full" : "flex-1"} min-h-[44px] rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`}
    >
      {children}
    </button>
  );
}

/**
 * Renders the initial choice UI (before "choosing" state).
 * 
 * This is the logic being tested for mutant 3 (hideKeepAndRest).
 */
export function DayPlanInitialChoices({
  isRestDay,
  hideKeepAndRest,
  intro,
  onChoosing,
  onKeep,
  onRest,
  disabled = false,
}: {
  isRestDay: boolean;
  hideKeepAndRest: boolean;
  intro?: string;
  onChoosing: () => void;
  onKeep: () => void;
  onRest: () => void;
  disabled?: boolean;
}) {
  if (isRestDay) {
    return (
      <div className="mt-4">
        <button
          disabled={disabled}
          onClick={onChoosing}
          className="w-full min-h-[44px] rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          {intro === "Start your first session now." ? "Start your first session now" : "Pick a workout"}
        </button>
      </div>
    );
  }

  if (hideKeepAndRest) {
    return (
      <div className="mt-4">
        <button
          disabled={disabled}
          onClick={onChoosing}
          className="w-full min-h-[44px] rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          Pick a workout
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      <Choice disabled={disabled} onClick={onKeep}>
        Keep it
      </Choice>
      <Choice disabled={disabled} onClick={onChoosing}>
        Swap the day
      </Choice>
      <Choice disabled={disabled} onClick={onRest}>
        Rest
      </Choice>
    </div>
  );
}

/**
 * Renders the choosing state UI (list of options).
 */
export function DayPlanChoosingOptions({
  days,
  onChooseDay,
  onChooseYoga,
  onChooseBreathing,
  onCancel,
  disabled = false,
}: {
  days: PlannableDay[];
  onChooseDay: (programDayId: string, label: string) => void;
  onChooseYoga: () => void;
  onChooseBreathing: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 space-y-2">
      {days.map((d) => (
        <Choice
          key={d.programDayId}
          wide
          disabled={disabled}
          onClick={() => onChooseDay(d.programDayId, d.label)}
        >
          {d.label}
        </Choice>
      ))}
      <Choice wide disabled={disabled} onClick={onChooseYoga}>
        Yoga
      </Choice>
      <Choice
        wide
        disabled={disabled}
        onClick={onChooseBreathing}
      >
        Breathing
      </Choice>
      <button
        onClick={onCancel}
        className="w-full min-h-[44px] py-2 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      >
        Never mind
      </button>
    </div>
  );
}
