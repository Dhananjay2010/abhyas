"use client";

import type { ReactNode } from "react";

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${current + 1} of ${total}`}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * One question per screen. The footer is sticky so the primary action stays
 * under the thumb no matter how long the option list gets.
 */
export function StepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  onBack,
  footer,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-6">
      <div className="flex items-center gap-4">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Go back"
            className="-ml-2 shrink-0 rounded-lg p-2 text-muted transition-colors hover:text-fg"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span className="w-1" />
        )}
        <ProgressBar current={step} total={totalSteps} />
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {step + 1}/{totalSteps}
        </span>
      </div>

      <div className="flex-1 pb-6 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>

      <div className="sticky bottom-0 -mx-6 bg-gradient-to-t from-bg via-bg to-transparent px-6 pb-8 pt-4">
        {footer}
      </div>
    </div>
  );
}

export function OptionCard({
  label,
  description,
  selected,
  onClick,
  compact,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border text-left transition-colors ${
        compact ? "px-4 py-3" : "px-5 py-4"
      } ${
        selected
          ? "border-accent bg-accent/10"
          : "border-border bg-surface hover:border-muted/50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`font-semibold ${selected ? "text-accent" : "text-fg"}`}>
          {label}
        </span>
        <span
          aria-hidden="true"
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
            selected ? "border-accent bg-accent" : "border-border"
          }`}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="var(--color-accent-fg)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </div>
      {description && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
      )}
    </button>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-fg">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-fg outline-none transition-colors placeholder:text-muted/60 focus:border-accent";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}
