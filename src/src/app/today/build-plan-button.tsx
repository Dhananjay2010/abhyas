"use client";

import { useState, useTransition } from "react";
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
 */
export function BuildPlanButton({
  label,
  confirm = true,
}: {
  label: string;
  confirm?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  function build() {
    startTransition(async () => {
      setError(null);
      const r = await buildPlan();
      if (!r.ok) return setError(r.error);
      setAsking(false);
      // buildPlan revalidates "/today"; the fresh tree arrives with the
      // action's response.
    });
  }

  if (asking) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
        <p className="text-sm text-accent">
          Rebuild your plan? Your exercises for the rest of this block are chosen
          again from your current answers. Every session you have logged is kept,
          and your week stays where it is.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            disabled={pending}
            onClick={build}
            className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Rebuilding…" : "Yes, rebuild"}
          </button>
          <button
            disabled={pending}
            onClick={() => setAsking(false)}
            className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50"
          >
            Keep my plan
          </button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
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
