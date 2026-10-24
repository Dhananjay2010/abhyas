"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildPlan } from "./actions";

/**
 * Build or rebuild the block.
 *
 * A rebuild throws away the current block's exercise selection and generates it
 * again from the user's answers. Nothing is lost from History, but it is the
 * most consequential control on Today -- a full-width accent button directly
 * above Sign out -- and it used to fire on the first tap with no explanation of
 * what it would do. It now says what will happen and asks, the same shape as
 * the confirmation on "Skip this exercise" in a session.
 *
 * `confirm={false}` is for the first build, where there is no plan to replace
 * and so nothing to warn about.
 * `onSuccess` is called after a successful rebuild.
 * `currentWeek` customizes the confirmation text to say "Week N" instead of generic text.
 */
export function BuildPlanButton({
  label,
  confirm = true,
  onSuccess,
  currentWeek,
  showSuccessState = false,
}: {
  label: string;
  confirm?: boolean;
  onSuccess?: () => void;
  currentWeek?: number | null;
  showSuccessState?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [success, setSuccess] = useState(false);

  function build() {
    startTransition(async () => {
      setError(null);
      const r = await buildPlan();
      if (!r.ok) return setError(r.error);
      setAsking(false);
      
      // Show success state if enabled
      if (showSuccessState) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
      }
      
      // Refresh to get fresh server-rendered isPlanStale
      router.refresh();
      
      // Call external success handler
      if (onSuccess) onSuccess();
    });
  }

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      >
        Plan rebuilt
      </div>
    );
  }

  if (asking) {
    const weekText = currentWeek !== null && currentWeek !== undefined
      ? `You stay in Week ${currentWeek} of this block.`
      : "Your week stays where it is.";
    
    return (
      <div 
        className="fixed inset-x-0 z-40 mx-auto max-w-md px-6"
        style={{
          bottom: "calc(68px + env(safe-area-inset-bottom))"
        }}
      >
        <div className="rounded-xl border border-accent bg-surface p-4 shadow-lg">
          <p className="text-sm">
            Rebuild your plan? Your exercises for the rest of this block are chosen
            again from your current answers. Every session you have logged is kept.
          </p>
          <p className="mt-2 text-sm text-muted">{weekText}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={pending}
              onClick={build}
              className="rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
              style={{ minHeight: "44px" }}
            >
              {pending ? "Rebuilding…" : "Yes, rebuild"}
            </button>
            <button
              disabled={pending}
              onClick={() => setAsking(false)}
              className="rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50"
              style={{ minHeight: "44px" }}
            >
              Keep my plan
            </button>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        disabled={pending}
        onClick={() => (confirm ? setAsking(true) : build())}
        className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Building your block…" : label}
      </button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}
