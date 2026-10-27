"use client";

import { useState, useTransition } from "react";
import { logBodyWeight } from "./actions";
import { 
  formatBodyWeight, 
  parseBodyWeight, 
  weightLabel,
  getBodyWeightRangeMessage,
  type UnitsPreference 
} from "@/lib/units";

export function LogWeight({ 
  current,
  units,
  logAction = logBodyWeight,
}: { 
  current: number | null;
  units: UnitsPreference;
  logAction?: (kg: number) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    current !== null ? formatBodyWeight(current, units, false) : ""
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        Log today&apos;s weight
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={weightLabel(units)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg font-semibold tabular-nums outline-none focus:border-accent"
        />
        <button
          disabled={pending || value === ""}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const weightKg = parseBodyWeight(value, units);
              if (weightKg === null) {
                setError(getBodyWeightRangeMessage(units));
                return;
              }
              const r = await logAction(weightKg);
              if (!r.ok) return setError(r.error);
              setOpen(false);
            })
          }
          className="shrink-0 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
