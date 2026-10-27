"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planDay, type DayPlan, type PlannableDay } from "@/app/session/actions";
import { isOfflineError } from "@/lib/offline-error";

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
  sessionId,
  localDate,
  dayLabel,
  plannedLabel,
  days,
  heading,
  intro,
  showRestOption = true,
  onPlan = planDay,
}: {
  /** The session ID whose local_date + 1 is the target date (for end-of-session prompts). */
  sessionId?: string;
  /** The day being planned, as a local `YYYY-MM-DD` (for Today page prompts). */
  localDate?: string;
  /** How to name that day to the user: "Tomorrow", "Today", "Thursday". */
  dayLabel: string;
  /** What the block currently says that day is. */
  plannedLabel: string;
  /** The training days of the block, offered as alternatives. */
  days: PlannableDay[];
  heading: string;
  intro?: string;
  /** Whether to show the "Rest" option. Set to false when day is already Rest. */
  showRestOption?: boolean;
  /** Injected so the prompt can be driven without a signed-in session. */
  onPlan?: typeof planDay;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ plan: DayPlan; describedAs: string } | null>(null);

  function choose(plan: DayPlan, describedAs: string) {
    setError(null);
    setLastAttempt({ plan, describedAs });
    startTransition(async () => {
      try {
        // Type-safe construction without cast
        const input = sessionId 
          ? { sessionId, plan }
          : localDate
          ? { localDate, plan }
          : { plan } as never; // Should never happen - component requires one or the other
        const r = await onPlan(input);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setChoosing(false);
        setSettled(describedAs);
        // Today reads the override on the server, so it has to re-render.
        router.refresh();
      } catch (err) {
        // Network errors (offline, timeout, etc) must show friendly inline copy,
        // not reach the error boundary and wipe the post-session summary.
        const message = isOfflineError(err)
          ? "Couldn't save. Check your connection and try again."
          : "Couldn't save. Please try again.";
        setError(message);
      }
    });
  }

  if (settled) {
    // MED-C: Use dayLabel (context-dependent) instead of hardcoding "Tomorrow"
    const settledCopy = settled.toLowerCase() === "rest" || settled === "a rest day"
      ? `${dayLabel} is a rest day.`
      : `${dayLabel} is ${settled}.`;
    return (
      <section className="mt-8 rounded-xl border border-success/30 bg-success/10 px-5 py-4">
        <p className="text-sm text-success">
          {settledCopy}
        </p>
        <button
          onClick={() => {
            setSettled(null);
            setChoosing(true);
          }}
          className="mt-2 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg"
        >
          Change it
        </button>
      </section>
    );
  }

  const isRestDay = plannedLabel.toLowerCase() === "rest";
  const isTomorrowLabel = dayLabel === "Tomorrow";
  const showNewRestUI = isRestDay && isTomorrowLabel;

  if (showNewRestUI) {
    return (
      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{heading}</h2>
        <p className="mt-2 text-sm text-muted">
          {dayLabel}: rest day. Train anyway?
        </p>

        {!choosing ? (
          <div className="mt-4 flex gap-2">
            <Choice disabled={pending} onClick={() => setChoosing(true)}>
              Train anyway
            </Choice>
            <Choice disabled={pending} onClick={() => choose({ kind: "keep" }, "a rest day")}>
              Keep rest
            </Choice>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {days.length === 0 ? (
              <p className="text-sm text-muted">
                No training days in this block.
              </p>
            ) : (
              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  {d.label}
                </Choice>
              ))
            )}
            {days.some((d) => d.dayType === "yoga") || days.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                // LOW fix: Retry actually retries the save
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 text-sm underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
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
        <div className={`mt-4 gap-2 ${showRestOption ? "grid grid-cols-3" : "flex"}`}>
          <Choice disabled={pending} onClick={() => choose({ kind: "keep" }, plannedLabel)}>
            Keep it
          </Choice>
          <Choice disabled={pending} onClick={() => setChoosing(true)}>
            Swap the day
          </Choice>
          {showRestOption && (
            <Choice disabled={pending} onClick={() => choose({ kind: "rest" }, "a rest day")}>
              Rest
            </Choice>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {days.map((d) => (
            <Choice
              key={d.programDayId}
              wide
              disabled={pending}
              onClick={() =>
                choose({ kind: "training", programDayId: d.programDayId }, d.label)
              }
            >
              {d.label}
            </Choice>
          ))}
          <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
            Yoga
          </Choice>
          <Choice
            wide
            disabled={pending}
            onClick={() => choose({ kind: "breathing" }, "breathing")}
          >
            Breathing
          </Choice>
          <button
            disabled={pending}
            onClick={() => setChoosing(false)}
            className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
          >
            Never mind
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <p>{error}</p>
          <button
            onClick={() => {
              setError(null);
              // LOW fix: Retry actually retries the save
              if (lastAttempt) {
                choose(lastAttempt.plan, lastAttempt.describedAs);
              }
            }}
            className="mt-2 text-sm underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}

function Choice({
  children,
  onClick,
  disabled,
  wide = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium transition-colors hover:text-fg disabled:opacity-50 ${
        wide ? "w-full text-left" : "text-center"
      }`}
    >
      {children}
    </button>
  );
}
