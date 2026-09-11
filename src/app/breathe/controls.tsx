import type { ReactNode } from "react";

/**
 * Small pieces shared by the breathing screens. No "use client": they hold no
 * state, so they render wherever they are imported from.
 */

export function Choice<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Monday to Sunday, a dot for each day you breathed. Today is ringed. */
export function WeekStrip({
  days,
  todayIndex,
  className = "",
}: {
  days: boolean[];
  /** 1..7, Monday first. */
  todayIndex: number;
  className?: string;
}) {
  const done = DAY_NAMES.filter((_, i) => days[i]);
  return (
    <div
      role="img"
      aria-label={done.length ? `This week you breathed on ${done.join(", ")}` : "No practice yet this week"}
      className={`grid grid-cols-7 gap-1 ${className}`}
    >
      {LETTERS.map((letter, i) => {
        const isToday = i + 1 === todayIndex;
        const future = i + 1 > todayIndex;
        return (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className={`text-[11px] ${isToday ? "font-semibold text-fg" : "text-muted"}`}>
              {letter}
            </span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                days[i]
                  ? "bg-breath shadow-[0_0_10px_rgba(111,216,210,0.6)]"
                  : future
                    ? "border border-border"
                    : "bg-surface-2"
              } ${isToday ? "ring-2 ring-breath/40 ring-offset-2 ring-offset-transparent" : ""}`}
            />
          </div>
        );
      })}
    </div>
  );
}

type IconProps = { className?: string };

export const Icon = {
  Back: ({ className }: IconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Sliders: ({ className }: IconProps) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="15" cy="6" r="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  Play: ({ className }: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  ),
  Pause: ({ className }: IconProps) => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  ),
  Sound: ({ className }: IconProps) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Muted: ({ className }: IconProps) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Caution: ({ className }: IconProps) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 4l9 16H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Chevron: ({ className }: IconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
