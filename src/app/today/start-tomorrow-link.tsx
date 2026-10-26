"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTomorrow } from "./actions";

/**
 * "Or start tomorrow" link for brand-new plans.
 * 
 * Shifts the anchor by one day: makes tomorrow day 1, today rest.
 * Only shown for block 1 before any session is started.
 */
export function StartTomorrowLink() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startTomorrow();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
      >
        Or start tomorrow
      </button>
      {error && (
        <p className="mt-1 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
