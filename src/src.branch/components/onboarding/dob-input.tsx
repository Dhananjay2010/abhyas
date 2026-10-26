"use client";

import { useRef, useState, useEffect } from "react";
import { parseDobParts } from "@/lib/onboarding/dob";

export interface DobInputProps {
  /** Current value as ISO date string (YYYY-MM-DD) or null */
  value: string | null;
  /** Called when the date changes (ISO string or null) */
  onChange: (iso: string | null) => void;
  /** Error message to display */
  error?: string;
  /** Called when any field is blurred */
  onBlur?: () => void;
}

/**
 * Three-field date of birth input (DD/MM/YYYY).
 * 
 * Features:
 * - Auto-advance: when a field is complete, focus moves to the next
 * - Backspace navigation: in an empty field, focus moves back
 * - Non-digit stripping
 * - Accessible: aria-labels, aria-describedby for errors
 * 
 * Reusable across onboarding and settings.
 */
export function DobInput({ value, onChange, error, onBlur }: DobInputProps) {
  // Parse initial value
  const [day, setDay] = useState(() => {
    if (!value) return "";
    const [, , d] = value.split("-");
    return d || "";
  });
  const [month, setMonth] = useState(() => {
    if (!value) return "";
    const [, m] = value.split("-");
    return m || "";
  });
  const [year, setYear] = useState(() => {
    if (!value) return "";
    const [y] = value.split("-");
    return y || "";
  });
  
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  
  // Track the last emitted value to avoid overwriting during typing
  const lastEmittedRef = useRef<string | null>(value);
  
  // Sync with external value changes (controlled component pattern)
  // Only resync if the value is genuinely external (not our own echo)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Skip if this is an echo of what we just emitted
    if (value === lastEmittedRef.current) return;
    
    if (value) {
      const [y, m, d] = value.split("-");
      setYear(y || "");
      setMonth(m || "");
      setDay(d || "");
    } else if (value === null) {
      setDay("");
      setMonth("");
      setYear("");
    }
    
    lastEmittedRef.current = value;
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */
  
  // Assemble and notify onChange
  useEffect(() => {
    let newValue: string | null = null;
    
    // Only emit when year has exactly 4 digits
    if (day && month && year && year.length === 4) {
      // Use parseDobParts to validate the date
      // Returns null for invalid dates (month 0, day 0, Feb 31, etc.)
      newValue = parseDobParts(day, month, year);
    }
    // For incomplete, empty, or invalid dates, newValue remains null
    
    // Only emit if the value actually changed
    if (newValue !== lastEmittedRef.current) {
      lastEmittedRef.current = newValue;
      onChange(newValue);
    }
  }, [day, month, year, onChange]);
  
  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    setDay(value);
    // Auto-advance to month when day is complete
    if (value.length === 2) {
      monthRef.current?.focus();
    }
  };
  
  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    setMonth(value);
    // Auto-advance to year when month is complete
    if (value.length === 2) {
      yearRef.current?.focus();
    }
  };
  
  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    setYear(value);
  };
  
  const handleDayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace in empty field does nothing (can't go back further)
    if (e.key === "Backspace" && day === "") {
      e.preventDefault();
    }
  };
  
  const handleMonthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace in empty field moves back to day
    if (e.key === "Backspace" && month === "") {
      e.preventDefault();
      dayRef.current?.focus();
    }
  };
  
  const handleYearKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace in empty field moves back to month
    if (e.key === "Backspace" && year === "") {
      e.preventDefault();
      monthRef.current?.focus();
    }
  };
  
  // Track focus state to only show errors after leaving the whole fieldset
  const handleFieldsetBlur = (e: React.FocusEvent<HTMLFieldSetElement>) => {
    // Only call onBlur if focus is leaving the entire fieldset
    // (not just moving between day/month/year)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onBlur?.();
    }
  };
  
  return (
    <fieldset aria-describedby={error ? "dob-error" : undefined} onBlur={handleFieldsetBlur}>
      <legend className="text-sm font-medium text-fg">Date of birth</legend>
      <div className="mt-2 flex gap-2">
        <input
          ref={dayRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="bday-day"
          value={day}
          onChange={handleDayChange}
          onKeyDown={handleDayKeyDown}
          placeholder="DD"
          aria-label="Day"
          className="w-20 rounded-lg border border-input bg-bg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="flex items-center text-muted">/</span>
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="bday-month"
          value={month}
          onChange={handleMonthChange}
          onKeyDown={handleMonthKeyDown}
          placeholder="MM"
          aria-label="Month"
          className="w-20 rounded-lg border border-input bg-bg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="flex items-center text-muted">/</span>
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="bday-year"
          value={year}
          onChange={handleYearChange}
          onKeyDown={handleYearKeyDown}
          placeholder="YYYY"
          aria-label="Year"
          className="w-28 rounded-lg border border-input bg-bg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && (
        <p id="dob-error" className="mt-1.5 text-sm text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </fieldset>
  );
}
