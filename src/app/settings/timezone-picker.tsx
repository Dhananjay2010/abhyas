"use client";

import { useState, useRef } from "react";

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

  // (a) Compute display value for special options
  const getDisplayValue = (val: string | null): string => {
    if (val === null || val === "") {
      return `Gym default (${gymDefault})`;
    }
    if (deviceZone && val === deviceZone) {
      return `Use this device's zone (${deviceZone})`;
    }
    return val;
  };

  // Derive display value from current prop - this is the value shown when not editing
  const displayValue = getDisplayValue(value);
  
  // Track local editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const handleFocus = () => {
    setIsEditing(true);
    setEditValue(displayValue);
    setIsValid(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
    setIsValid(true); // Reset validation while typing
  };

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    
    // Check for special options (a)
    if (deviceZone && (trimmed === `Use this device's zone (${deviceZone})` || trimmed === deviceZone)) {
      onChange(deviceZone);
      setIsValid(true);
      return;
    }
    
    if (trimmed === `Gym default (${gymDefault})` || trimmed === "") {
      onChange(null);
      setIsValid(true);
      return;
    }
    
    // Check if it's a valid timezone from the list
    if (timezones.includes(trimmed)) {
      onChange(trimmed);
      setIsValid(true);
      return;
    }
    
    // Invalid - show error but don't change value
    setIsValid(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  // Build datalist with special options first, then all timezones (b)
  const datalistOptions: string[] = [];
  if (deviceZone) {
    datalistOptions.push(`Use this device's zone (${deviceZone})`, deviceZone);
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
        className={`w-full rounded-xl border px-4 text-sm disabled:opacity-60 ${
          isValid
            ? "border-border bg-surface"
            : "border-danger bg-danger/10"
        }`}
        style={{ minHeight: "44px" }}
        aria-label="Timezone"
        aria-invalid={!isValid}
      />
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
