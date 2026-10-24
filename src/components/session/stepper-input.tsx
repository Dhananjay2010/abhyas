'use client';

import { useState, useRef } from 'react';

export interface StepperInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  nextFn?: (current: number, direction: 1 | -1) => number;
  min: number;
  max: number;
  kind: 'weight' | 'reps';
  unit?: string;
  'aria-label': string;
  disabled?: boolean;
}

/**
 * A stepper input with +/- buttons.
 * 
 * - Buttons are 44x44px (touch target size)
 * - Disabled at min/max bounds
 * - Pressing buttons does not open mobile keyboard or steal focus
 * - Invalid typed text is reverted or clamped on blur
 * - Uses theme tokens only (no hardcoded colors)
 */
export function StepperInput({
  value,
  onChange,
  step,
  nextFn,
  min,
  max,
  kind,
  unit,
  'aria-label': ariaLabel,
  disabled = false,
}: StepperInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [displayValue, setDisplayValue] = useState(String(value));
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const parseValue = (str: string): number => {
    if (kind === 'reps') {
      return parseInt(str, 10);
    }
    return parseFloat(str);
  };

  const handleFocus = () => {
    setIsEditing(true);
    setDisplayValue(String(value));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseValue(displayValue);
    
    if (isNaN(parsed)) {
      // Invalid input: revert to current value
      setDisplayValue(String(value));
      return;
    }

    // Clamp to bounds
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setDisplayValue(String(clamped));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  const handleDecrease = () => {
    if (disabled) return;

    let current = value;
    
    // If user is editing, step from the typed value
    if (isEditing) {
      const parsed = parseValue(displayValue);
      if (!isNaN(parsed)) {
        current = Math.max(min, Math.min(max, parsed));
      }
    }

    if (current <= min) return;
    
    const next = nextFn
      ? nextFn(current, -1)
      : current - (step ?? 1);
    
    // Clamp nextFn results to bounds
    const clamped = Math.max(min, Math.min(max, next));
    onChange(clamped);
    setAnnouncement(`${clamped}${unit ? ' ' + unit : ''}`);
  };

  const handleIncrease = () => {
    if (disabled) return;

    let current = value;
    
    // If user is editing, step from the typed value
    if (isEditing) {
      const parsed = parseValue(displayValue);
      if (!isNaN(parsed)) {
        current = Math.max(min, Math.min(max, parsed));
      }
    }

    if (current >= max) return;
    
    const next = nextFn
      ? nextFn(current, 1)
      : current + (step ?? 1);
    
    // Clamp nextFn results to bounds
    const clamped = Math.max(min, Math.min(max, next));
    onChange(clamped);
    setAnnouncement(`${clamped}${unit ? ' ' + unit : ''}`);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  const inputMode = kind === 'reps' ? 'numeric' : 'decimal';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDecrease}
        onPointerDown={(e) => e.preventDefault()}
        disabled={disabled || atMin}
        aria-label={`Decrease ${ariaLabel.toLowerCase()}`}
        className="flex items-center justify-center w-11 h-11 rounded-lg border border-border bg-surface-2 text-fg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface active:bg-surface transition-colors"
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
        </svg>
      </button>

      <div className="flex items-center gap-2 flex-1">
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          value={isEditing ? displayValue : String(value)}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label={ariaLabel}
          className="w-20 px-3 py-2 text-center rounded-lg border border-border bg-surface text-fg disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {unit && (
          <span className="text-muted text-sm">{unit}</span>
        )}
      </div>

      <button
        type="button"
        onClick={handleIncrease}
        onPointerDown={(e) => e.preventDefault()}
        disabled={disabled || atMax}
        aria-label={`Increase ${ariaLabel.toLowerCase()}`}
        className="flex items-center justify-center w-11 h-11 rounded-lg border border-border bg-surface-2 text-fg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface active:bg-surface transition-colors"
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </button>

      {/* Screen reader announcement for button changes */}
      <span
        aria-live="polite"
        className="sr-only"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0',
        }}
      >
        {announcement}
      </span>
    </div>
  );
}
