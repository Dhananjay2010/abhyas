"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSession } from "@/app/session/actions";
import SessionSkeleton from "@/app/session/[id]/loading";

export function StartSessionButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /*
   * While the session is being created, show the session screen's own
   * skeleton, full screen, rather than greying out the button.
   *
   * Creating a session writes several rows and cannot be made instant, so the
   * question is what the user looks at meanwhile. A disabled button reading
   * "Starting…" leaves them on Today with no sense that anything is
   * happening; the screen they asked for, arriving empty and then filling in,
   * reads as the app responding. It is also the exact skeleton the session
   * route shows, so nothing jumps when the navigation completes.
   */
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
            const r = await startSession();
            if (!r.ok) return setError(r.error);
            router.push(`/session/${r.data.sessionId}`);
          })
        }
        className="w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
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
