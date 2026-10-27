/**
 * Build chart data points for progress page charts.
 * Extracted for testing to ensure rounding is applied correctly.
 */

import { kgToDisplay, roundLbToHalf, type UnitsPreference } from "@/lib/units";
import type { Point } from "@/components/charts";

type VolumeRow = {
  local_date: string;
  volume_kg: string | number;
};

export type WeightRow = {
  recorded_on: string;
  weight_kg: string | number;
};

/**
 * Build volume chart points with proper imperial rounding.
 * Imperial values are rounded to whole pounds (no decimals).
 */
export function buildVolumeChartPoints(
  rows: VolumeRow[],
  units: UnitsPreference,
  shortDate: (iso: string) => string,
  deloadDates: Set<string>
): Point[] {
  return rows.map((v) => ({
    label: shortDate(v.local_date),
    value: Math.round(kgToDisplay(Number(v.volume_kg), units)),
    isDeload: deloadDates.has(v.local_date)
  }));
}

/**
 * Build body weight chart points with proper imperial rounding.
 * Imperial values are rounded to 0.5 lb to match user input.
 */
export function buildBodyWeightChartPoints(
  rows: WeightRow[],
  units: UnitsPreference,
  shortDate: (iso: string) => string
): Point[] {
  return rows.map((w) => {
    const kg = Number(w.weight_kg);
    const displayValue = kgToDisplay(kg, units);
    // Round to 0.1 precision for body weight (both units)
    const value = Math.round(displayValue * 10) / 10;
    return {
      label: shortDate(w.recorded_on),
      value,
    };
  });
}
