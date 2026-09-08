"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildPlan } from "./actions";

export function BuildPlanButton({ label }: { label: string }) {
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
            const r = await buildPlan();
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
        className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Building your block…" : label}
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
