"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planDay, startSession } from "@/app/session/actions";
import SessionSkeleton from "@/app/session/[id]/loading";

/**
 * Build the plan for starting a first training session.
 * Returns the plan object to pass to planDay.
 */
export function buildFirstSessionPlan(programDayId: string) {
  return {
    kind: "training" as const,
    programDayId,
  };
}

/**
 * Button that plans a specific training day and immediately starts it.
 * Used for first-session offer: brand-new users on rest day.
 */
export function StartFirstSessionButton({
  localDate,
  programDayId,
  label,
}: {
  localDate: string;
  programDayId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (pending) {
    return (
      <div className="fixed inset-0 z-40 overflow-hidden bg-bg">
        <SessionSkeleton />
        <span className="sr-only">Getting your session ready…</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            setError(null);
            // First, plan the day with the chosen training day
            const planResult = await planDay({
              localDate,
              plan: buildFirstSessionPlan(programDayId),
            });
            if (!planResult.ok) {
              setError(planResult.error);
              return;
            }
            // Then start the session
            const sessionResult = await startSession();
            if (!sessionResult.ok) {
              setError(sessionResult.error);
              return;
            }
            router.push(`/session/${sessionResult.data.sessionId}`);
          })
        }
        className="mt-4 block w-full rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {label}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
