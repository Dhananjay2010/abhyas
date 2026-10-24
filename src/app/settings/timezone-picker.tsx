"use client";

import { useState, useRef } from "react";
import { getTimezoneDisplayValue, decideTimezoneCommit } from "./timezone-picker-logic";

/**
 * (c) Searchable timezone picker that works at 390px.
 * Uses <input list> datalist with validation against the list on blur.
 * Touch targets are at least 44px, brand colours from parent component.
 * 
 * (a) Special options:
 * - First: "Use this device's zone (<zone>)" - stores the actual device zone
 * - Second: "Gym default (<zone>)" - stores null (empty string)
 * - Then: searchable list of all timezones
 */
export function TimezonePicker({
  value,
  timezones,
  deviceZone,
  gymDefault,
  onChange,
  disabled,
}: {
  value: string | null;
  timezones: string[];
  deviceZone: string | null;
  gymDefault: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [isValid, setIsValid] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  // QA Bug fix: Use ref to avoid stale closure in handleBlur after Escape
  const cancelRef = useRef(false);

  // Derive display value from current prop - this is the value shown when not editing
  const displayValue = getTimezoneDisplayValue(value, deviceZone, gymDefault);
  
  // Track local editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const handleFocus = () => {
    setIsEditing(true);
    setEditValue(displayValue);
    setIsValid(true);
    cancelRef.current = false;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
    setIsValid(true); // Reset validation while typing
    cancelRef.current = false; // Clear cancel flag if user continues typing
  };

  const handleBlur = () => {
    setIsEditing(false);
    
    // QA Bug fix: Read cancelRef.current to get the current value, not stale closure
    const wasCanceled = cancelRef.current;
    cancelRef.current = false; // Reset for next interaction
    
    // QA Issue #7: Use pure commit/cancel logic
    const decision = decideTimezoneCommit(
      editValue,
      timezones,
      deviceZone,
      gymDefault,
      wasCanceled
    );
    
    if (decision.commit) {
      // Valid input - commit the change
      onChange(decision.value);
      setIsValid(true);
    } else if (wasCanceled) {
      // Escape pressed - restore previous value without error (don't flash validation error)
      setIsValid(true);
    } else {
      // Invalid input - show error but don't change value
      setIsValid(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      // QA Issue #7: Escape must CANCEL - restore previous, no onChange, blur
      // QA Bug fix: Set ref before blur so handleBlur sees the current value
      e.preventDefault();
      cancelRef.current = true;
      inputRef.current?.blur();
    }
  };

  // Build datalist with special options first, then all timezones (b)
  // Don't list device zone twice - it's already in timezones (canonicalized)
  const datalistOptions: string[] = [];
  if (deviceZone) {
    datalistOptions.push(`Use this device's zone (${deviceZone})`);
  }
  datalistOptions.push(`Gym default (${gymDefault})`);
  datalistOptions.push(...timezones);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        list="timezone-options"
        value={isEditing ? editValue : displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Search timezones"
        className={`w-full rounded-xl border px-4 pr-10 text-sm disabled:opacity-60 ${
          isValid
            ? "border-border bg-surface"
            : "border-danger bg-danger/10"
        }`}
        style={{ minHeight: "44px" }}
        aria-label="Timezone"
        aria-invalid={!isValid}
      />
      
      {/* Search icon on the right */}
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>

      <datalist id="timezone-options">
        {datalistOptions.map((tz, idx) => (
          <option key={`${tz}-${idx}`} value={tz} />
        ))}
      </datalist>
      {!isValid && (
        <p className="mt-1 text-xs text-danger">
          Please select a valid timezone from the list
        </p>
      )}
    </div>
  );
}
