"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSession } from "@/app/session/actions";

export function StartSessionButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
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
        {pending ? "Starting…" : label}
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
