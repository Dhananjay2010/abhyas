"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  planDay,
  refreshAfterSession,
  type DayPlan,
  type PlannableDay,
  type PlanRetarget,
} from "@/app/session/actions";
import { DAY_CHANGED_ERROR, planPromptHeading } from "@/lib/session/resolve-plan-target-date";
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
/** How long an end-of-session confirmation stays up before Today (QA1 LOW-1). */
export const SESSION_CONFIRM_MS = 1500;

export function DayPlanPrompt({
  sessionId,
  shownDate,
  localDate,
  dayLabel,
  displayLabel,
  plannedLabel,
  programDayId,
  days,
  heading,
  intro,
  showRestOption = true,
  onPlan = planDay,
  onRefresh = refreshAfterSession,
}: {
  /** The session ID whose local_date + 1 is the target date (for end-of-session prompts). */
  sessionId?: string;
  /**
   * End-of-session: the target day this prompt shows (the page's
   * `tomorrow.localDate`). Sent with the choice so the server saves this day,
   * not one re-derived at tap time (QA3 LOW-1).
   */
  shownDate?: string;
  /** The day being planned, as a local `YYYY-MM-DD` (for Today page prompts). */
  localDate?: string;
  /** How to name that day to the user: "Tomorrow", "Today", "Thursday". */
  dayLabel: string;
  /**
   * The name shown for that day when it differs from `dayLabel`'s framing: an
   * end-of-session prompt (dayLabel "Tomorrow") about today after a
   * next-morning finish passes "Today" (QA1 LOW-2).
   */
  displayLabel?: string;
  /** What the block currently says that day is. */
  plannedLabel: string;
  /** The resolved program_day_id for this day (after collision resolution). Null for Rest. */
  programDayId: string | null;
  /** The training days of the block, offered as alternatives. */
  days: PlannableDay[];
  heading: string;
  intro?: string;
  /** Whether to show the "Rest" option. Set to false when day is already Rest. */
  showRestOption?: boolean;
  /** Injected so the prompt can be driven without a signed-in session. */
  onPlan?: typeof planDay;
  /** Injected for the same reason; refreshes Today after an end-of-session choice. */
  onRefresh?: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ plan: DayPlan; describedAs: string } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);
  // QA3 LOW-1: when the server says the shown day has passed, it sends the
  // new day; show that one (unsaved) and send it with the next choice.
  const [retarget, setRetarget] = useState<PlanRetarget | null>(null);
  const shownLabel = retarget?.label ?? displayLabel ?? dayLabel;
  const shownDay = retarget?.localDate ?? shownDate;
  const shownPlanned = retarget?.plannedLabel ?? plannedLabel;
  const shownProgramDayId = retarget ? retarget.programDayId : programDayId;
  const shownDays = retarget?.days ?? days;
  const shownHeading = retarget ? planPromptHeading(retarget.label) : heading;

  // LOW-7: Non-retryable errors (core errors that won't change on retry)
  const NON_RETRYABLE_ERRORS = [
    "That day is not in your block.",
    "That day is already done.",
    "That day has already been and gone.",
    "That session has already started.",
    "Cannot save: missing session or date.",
    // QA3 LOW-6: retrying cannot bring a missing session back.
    "Session not found.",
    // QA3 LOW-1: the day changed; choose again for the new day.
    DAY_CHANGED_ERROR,
  ];

  const isRetryable = error && !NON_RETRYABLE_ERRORS.some(msg => error.includes(msg));

  // Sort days so nextUp is first (preselected)
  const sortedDays = [...shownDays].sort((a, b) => {
    if (a.nextUp && !b.nextUp) return -1;
    if (!a.nextUp && b.nextUp) return 1;
    return 0;
  });

  function choose(plan: DayPlan, describedAs: string) {
    setError(null);
    setLastAttempt({ plan, describedAs });
    startTransition(async () => {
      try {
        // Require either sessionId OR localDate
        if (!sessionId && !localDate) {
          setError("Cannot save: missing session or date.");
          return;
        }

        const input = sessionId 
          ? { sessionId, plan, ...(shownDay ? { shownDate: shownDay } : {}) }
          : { localDate: localDate!, plan };

        const r = await onPlan(input);
        if (!r.ok) {
          if ("retarget" in r && r.retarget) {
            setRetarget(r.retarget);
            setChoosing(false);
          }
          setError(r.error);
          return;
        }
        setChoosing(false);
        setSettled(describedAs);
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        if (sessionId) {
          // QA1 LOW-1: the session summary stays up with the confirmation for
          // SESSION_CONFIRM_MS; only then is Today revalidated, and that
          // re-render takes the completed session's summary on to Today.
          leaveTimer.current = setTimeout(() => {
            leaveTimer.current = null;
            // A failed refresh leaves the summary up; "Back to Today" still works.
            void Promise.resolve().then(onRefresh).catch(() => {});
          }, SESSION_CONFIRM_MS);
          return;
        }
        // Delay redirect so confirmation is visible for ~1.2s
        leaveTimer.current = setTimeout(() => {
          // Today reads the override on the server, so it has to re-render.
          router.refresh();
        }, 1200);
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
      ? `${shownLabel} is a rest day.`
      : `${shownLabel} is ${settled}.`;
    return (
      <section className="mt-8 rounded-xl border border-success/30 bg-success/10 px-5 py-4">
        <p className="text-sm text-success">
          {settledCopy}
        </p>
        <button
          onClick={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
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

  const isRestDay = shownPlanned.toLowerCase() === "rest";
  const isTomorrowLabel = dayLabel === "Tomorrow";
  const showNewRestUI = isRestDay && isTomorrowLabel;

  if (showNewRestUI) {
    // Rest branch: same order and "Next up" badge as the swap list (#165).
    return (
      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{shownHeading}</h2>
        <p className="mt-2 text-sm text-muted">
          {shownLabel}: rest day. Train anyway?
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
            {shownDays.length === 0 ? (
              <p className="text-sm text-muted">
                No training days in this block.
              </p>
            ) : (
              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>
                    {d.nextUp && (
                      <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                        Next up
                      </span>
                    )}
                  </div>
                </Choice>
              ))
            )}
            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
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
            {isRetryable && (
              <button
                onClick={() => {
                  setError(null);
                  if (lastAttempt) {
                    choose(lastAttempt.plan, lastAttempt.describedAs);
                  }
                }}
                className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{shownHeading}</h2>
      <p className="mt-2 text-sm text-muted">
        {intro ? `${intro} ` : ""}
        {shownLabel} is <span className="font-medium text-fg">{shownPlanned}</span>.
      </p>

      {!choosing ? (
        <div className={`mt-4 gap-2 ${showRestOption ? "grid grid-cols-3" : "flex"}`}>
          <Choice
            disabled={pending}
            onClick={() =>
              shownProgramDayId
                ? choose({ kind: "training", programDayId: shownProgramDayId }, shownPlanned)
                : choose({ kind: "keep" }, shownPlanned)
            }
          >
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
          {sortedDays.map((d) => (
            <Choice
              key={d.programDayId}
              wide
              disabled={pending}
              onClick={() =>
                choose({ kind: "training", programDayId: d.programDayId }, d.label)
              }
            >
              <div className="flex items-center justify-between">
                <span>{d.label}</span>
                {d.nextUp && (
                  <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                    Next up
                  </span>
                )}
              </div>
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
            className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
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
          {isRetryable && (
            <button
              onClick={() => {
                setError(null);
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
            >
              Retry
            </button>
          )}
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
