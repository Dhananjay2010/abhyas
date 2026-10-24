"use client";

import { useState } from "react";

type WelcomeCardProps = {
  blockNumber: number;
  daysPerWeek: number;
  weekSchedule: Array<{ dayName: string; isTraining: boolean }>;
  sessionMinutes: number;
  blockLength: number;
  deloadWeek: number;
};

/**
 * First-run welcome card shown once after onboarding.
 *
 * Explains:
 * - Block length and deload week
 * - This week's training days with a Mon-Sun preview
 * - Session time estimate
 *
 * Dismissed via cookie (set by server action). No localStorage, no hydration mismatch.
 */
export function WelcomeCard({
  blockNumber,
  daysPerWeek,
  weekSchedule,
  sessionMinutes,
  blockLength,
  deloadWeek,
}: WelcomeCardProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  async function handleDismiss() {
    setIsDismissed(true);
    // Set cookie via server action
    await fetch("/api/dismiss-welcome", { method: "POST" });
  }

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  return (
    <section className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
      <h2 className="text-lg font-semibold text-accent">
        Welcome to Block {blockNumber}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-fg">
        <p>
          Your plan runs for <strong>{blockLength} weeks</strong>. Week {deloadWeek} is lighter (a deload), then you
          start the next block with heavier weights.
        </p>

        <div>
          <p className="font-medium mb-2">
            Training {daysPerWeek} strength {daysPerWeek === 1 ? "day" : "days"} per week:
          </p>
          <div className="flex gap-1">
            {weekSchedule.map((day, idx) => (
              <div
                key={idx}
                className={`flex-1 rounded px-2 py-1.5 text-center text-xs font-medium ${
                  day.isTraining
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-2 text-muted"
                }`}
                title={day.dayName}
              >
                {day.dayName.slice(0, 3)}
              </div>
            ))}
          </div>
        </div>

        <p>
          Sessions take about <strong>{sessionMinutes} minutes</strong> including warm-up.
          You can adjust this in Settings.
        </p>
      </div>

      <button
        onClick={handleDismiss}
        className="mt-4 w-full min-h-[44px] rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-accent/10"
      >
        Got it
      </button>
    </section>
  );
}
