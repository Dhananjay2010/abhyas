"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planDay, type DayPlan, type PlannableDay } from "@/app/session/actions";
import { DayPlanInitialChoices, DayPlanChoosingOptions } from "./day-plan-prompt-ui";

/**
 * "What about tomorrow?" — SPEC.md section 7.
 *
 * Shown at the end of a session about the next day, and on Today about today
 * when the previous day was a training day nobody finished. Both are the same
 * question, so they are the same component; only the framing changes.
 *
 * A choice writes a one-day override and nothing else moves — the block keeps
 * its dates and the deload week stays where it was. "Keep the plan" removes an
 * override rather than writing one, so changing your mind costs nothing.
 */
export function DayPlanPrompt({
  localDate,
  dayLabel,
  plannedLabel,
  days,
  heading,
  intro,
  isRestDay = false,
  hideKeepAndRest = false,
  onPlan = planDay,
}: {
  /** The day being planned, as a local `YYYY-MM-DD`. */
  localDate: string;
  /** How to name that day to the user: "Tomorrow", "Today", "Thursday". */
  dayLabel: string;
  /** What the block currently says that day is. */
  plannedLabel: string;
  /** The training days of the block, offered as alternatives. */
  days: PlannableDay[];
  heading: string;
  intro?: string;
  /** If true, show only "Pick a workout" button (rest day already settled). */
  isRestDay?: boolean;
  /** If true (when today is already rest + yesterday missed), hide Keep it and Rest buttons. */
  hideKeepAndRest?: boolean;
  /** Injected so the prompt can be driven without a signed-in session. */
  onPlan?: typeof planDay;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(plan: DayPlan, describedAs: string) {
    setError(null);
    startTransition(async () => {
      const r = await onPlan({ localDate, plan });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setChoosing(false);
      setSettled(describedAs);
      // Today reads the override on the server, so it has to re-render.
      router.refresh();
    });
  }

  if (settled) {
    return (
      <section className="mt-8 rounded-xl border border-success/30 bg-success/10 px-5 py-4">
        <p className="text-sm text-success">
          {dayLabel} is {settled}.
        </p>
        <button
          onClick={() => {
            setSettled(null);
            setChoosing(true);
          }}
          className="mt-2 min-h-[44px] text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-success/10"
        >
          Change it
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{heading}</h2>
      <p className="mt-2 text-sm text-muted">
        {intro ? `${intro} ` : ""}
        {dayLabel} is <span className="font-medium text-fg">{plannedLabel}</span>.
      </p>

      {!choosing ? (
        <DayPlanInitialChoices
          isRestDay={isRestDay}
          hideKeepAndRest={hideKeepAndRest}
          buttonLabel={intro}
          onChoosing={() => setChoosing(true)}
          onKeep={() => choose({ kind: "keep" }, plannedLabel)}
          onRest={() => choose({ kind: "rest" }, "a rest day")}
          disabled={pending}
        />
      ) : (
        <DayPlanChoosingOptions
          days={days}
          onChooseDay={(programDayId, label) => choose({ kind: "training", programDayId }, label)}
          onChooseYoga={() => choose({ kind: "yoga" }, "yoga")}
          onChooseBreathing={() => choose({ kind: "breathing" }, "breathing")}
          onCancel={() => setChoosing(false)}
          disabled={pending}
        />
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </section>
  );
}
