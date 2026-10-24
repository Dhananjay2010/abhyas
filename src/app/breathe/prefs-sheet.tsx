"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DEFAULT_MINUTE_CHOICES, type BreathingPrefs } from "@/lib/breathing/pattern";
import type { PrefsPatch } from "@/lib/breathing/validation";
import { vibrationSupported } from "@/lib/session/device";
import { focusTrap } from "@/lib/focus-trap";
import type { Result } from "./actions";
import { Choice, Field } from "./controls";
import { SoundControls } from "./sound-controls";
import { useClientValue } from "./use-media";

/**
 * Breathing preferences, as a sheet over the Breathe tab. They used to be one
 * control in Settings under "Reminders"; they live with the practice now
 * (decision Q9). Each change saves as it is made, like the Settings screen.
 */
export function PrefsSheet({
  prefs,
  onChange,
  onClose,
  save,
}: {
  prefs: BreathingPrefs;
  onChange: (next: BreathingPrefs) => void;
  onClose: () => void;
  save: (patch: PrefsPatch) => Promise<Result>;
}) {
  const [status, setStatus] = useState<{ state: "idle" | "saving" | "saved" | "error"; error?: string }>({
    state: "idle",
  });
  const [, startTransition] = useTransition();
  const canVibrate = useClientValue(vibrationSupported, false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Store the element that opened this sheet
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement;
  }, []);

  // Set up focus trap
  useEffect(() => {
    if (!containerRef.current) return;
    const trap = focusTrap({
      element: containerRef.current,
      onEscape: onClose,
      returnFocusTo: triggerRef.current,
      initialFocus: true,
    });
    return () => trap.release();
  }, [onClose]);

  const set = (patch: PrefsPatch) => {
    onChange({ ...prefs, ...patch });
    setStatus({ state: "saving" });
    startTransition(async () => {
      const r = await save(patch);
      setStatus(r.ok ? { state: "saved" } : { state: "error", error: r.error });
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="breathing-prefs-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface px-6 pt-4"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div aria-hidden="true" className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <h2
          id="breathing-prefs-title"
          tabIndex={-1}
          className="text-xl font-bold tracking-tight outline-none"
        >
          Breathing preferences
        </h2>
        <p className="mt-1 text-sm text-muted">Saved as you change them.</p>

        <div className="mt-6 space-y-5">
          <Field label="Usual length" hint="Where a practice starts, until you pick something else for it.">
            <Choice
              label="Usual length"
              value={prefs.defaultMinutes}
              options={DEFAULT_MINUTE_CHOICES.map((n) => ({ value: n, label: `${n}m` }))}
              onChange={(n) => set({ defaultMinutes: n })}
            />
          </Field>

          <SoundControls prefs={prefs} onChange={set} />

          <Field label="Seconds count">
            <Choice
              label="Seconds count"
              value={prefs.showCount}
              options={[
                { value: true, label: "Show" },
                { value: false, label: "Hide" },
              ]}
              onChange={(v) => set({ showCount: v })}
            />
          </Field>

          <Field label="Settle in first" hint="A few seconds to get comfortable before the first breath.">
            <Choice
              label="Settle in first"
              value={prefs.settleIn}
              options={[
                { value: true, label: "On" },
                { value: false, label: "Off" },
              ]}
              onChange={(v) => set({ settleIn: v })}
            />
          </Field>

          <Field
            label="How do you feel?"
            hint="A one-tap check-in, so you can see which practices work for you."
          >
            <Choice
              label="Mood check-in"
              value={prefs.checkIn}
              options={[
                { value: "off", label: "Off" },
                { value: "after", label: "After" },
                { value: "both", label: "Before & after" },
              ]}
              onChange={(v) => set({ checkIn: v })}
            />
          </Field>

          {canVibrate ? (
            <Field label="Vibrate on each breath">
              <Choice
                label="Vibrate on each breath"
                value={prefs.vibrate}
                options={[
                  { value: true, label: "On" },
                  { value: false, label: "Off" },
                ]}
                onChange={(v) => set({ vibrate: v })}
              />
            </Field>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              This browser cannot vibrate the phone. iPhone Safari never can, so on an
              iPhone use sound to breathe with your eyes closed.
            </p>
          )}
        </div>

        <p aria-live="polite" className="mt-5 min-h-5 text-xs">
          {status.state === "saving" && <span className="text-muted">Saving…</span>}
          {status.state === "saved" && <span className="text-muted">Saved</span>}
          {status.state === "error" && <span className="text-danger">{status.error}</span>}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-6 py-3.5 text-sm font-semibold transition-colors hover:border-muted/50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
