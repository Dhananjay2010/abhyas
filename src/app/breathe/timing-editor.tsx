"use client";

import { buildCycle, type BreathPhase } from "@/lib/breathing/engine";
import { secondsLabel } from "@/lib/breathing/pattern";
import { MAX_PHASE_SECONDS, MIN_PHASE_SECONDS, PHASE_STEP } from "@/lib/breathing/validation";
import { formatClock } from "@/lib/session/device";

// The editor only ever sees the three timed kinds: a practice that pumps is
// not offered here, and a practice you build yourself is the four-slot shape.
const KIND_LABEL: Record<BreathPhase["kind"], string> = {
  inhale: "In",
  hold: "Hold",
  exhale: "Out",
  pump: "Pump",
  rest: "Rest",
};

function phaseLabel(phase: BreathPhase): string {
  const base = phase.label ?? KIND_LABEL[phase.kind];
  if (!phase.side) return base;
  return `${base} · ${phase.side === "left" ? "left" : "right"}`;
}

/**
 * One stepper per phase, in half-seconds.
 *
 * It edits the seconds of the phases a practice already has, never their
 * order, their words or which nostril is open -- so it works for Nadi
 * Shodhana's six phases and the sigh's two-part inhale, not just for a four
 * count square. A hold can be taken to zero, which drops it entirely.
 */
export function TimingEditor({
  phases,
  onChange,
  canRemoveHolds = true,
}: {
  phases: BreathPhase[];
  onChange: (next: BreathPhase[]) => void;
  /** A hold may be stepped down to zero, which turns it off. */
  canRemoveHolds?: boolean;
}) {
  const set = (index: number, seconds: number) => {
    onChange(phases.map((p, i) => (i === index ? { ...p, seconds } : p)));
  };

  const timed = phases.filter((p) => p.seconds > 0);
  const total = timed.reduce((n, p) => n + p.seconds, 0);
  const breaths = timed.length > 0 ? buildCycle(timed).breaths : 0;
  const floorFor = (p: BreathPhase) =>
    p.kind === "hold" && canRemoveHolds ? 0 : MIN_PHASE_SECONDS;

  return (
    <div>
      <ul className="space-y-2">
        {phases.map((phase, i) => {
          const min = floorFor(phase);
          const atMin = phase.seconds <= min;
          const atMax = phase.seconds >= MAX_PHASE_SECONDS;
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {phaseLabel(phase)}
                {phase.seconds === 0 && <span className="ml-2 text-xs text-muted">off</span>}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`${phaseLabel(phase)}: half a second less`}
                  disabled={atMin}
                  onClick={() =>
                    set(i, Math.max(min, Math.round((phase.seconds - PHASE_STEP) * 2) / 2))
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-lg disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-14 text-center text-sm font-semibold tabular-nums">
                  {phase.seconds === 0 ? "—" : secondsLabel(phase.seconds)}
                </span>
                <button
                  type="button"
                  aria-label={`${phaseLabel(phase)}: half a second more`}
                  disabled={atMax}
                  onClick={() =>
                    set(
                      i,
                      Math.min(
                        MAX_PHASE_SECONDS,
                        Math.round((Math.max(phase.seconds, 0) + PHASE_STEP) * 2) / 2,
                      ),
                    )
                  }
                  className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-lg disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="mt-2 text-xs text-muted tabular-nums">
        {total > 0
          ? `One breath: ${formatClock(Math.round(total))}${breaths > 1 ? ` · ${breaths} breaths a round` : ""}`
          : "Every phase is off."}
      </p>
    </div>
  );
}
