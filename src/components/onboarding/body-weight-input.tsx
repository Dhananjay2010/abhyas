"use client";

import { useState } from "react";
import {
  parseBodyWeight,
  getBodyWeightRangeMessage,
  weightLabel,
  type UnitsPreference,
} from "@/lib/units";

/**
 * Extracted body weight input for testing parity with Progress LogWeight.
 * Tests that both components use parseBodyWeight and getBodyWeightRangeMessage.
 */
export function OnboardingBodyWeightInput({
  units,
  value: initialValue,
  onChange,
  onBlur,
  onValidSubmit,
}: {
  units: UnitsPreference;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onValidSubmit?: (kg: number) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const weightKg = parseBodyWeight(value, units);
  const error = touched && value !== "" && weightKg === null
    ? getBodyWeightRangeMessage(units)
    : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur();
    
    if (value !== "" && weightKg !== null && onValidSubmit) {
      onValidSubmit(weightKg);
    }
  };

  return (
    <div>
      <label className="block">
        <span className="text-sm text-muted">
          {weightLabel(units)}
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={units === "imperial" ? "e.g. 154" : "e.g. 70"}
          step="any"
          className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-4 text-center text-2xl font-semibold tabular-nums outline-none focus:border-accent"
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
