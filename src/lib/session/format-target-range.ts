/**
 * Format target range for session runner header display.
 * 
 * Guards against:
 * - Rendering '0 reps' or '0 seconds'
 * - min > max (invalid range)
 * - Handles min === max (single value)
 */

export function formatTargetRange(params: {
  min: number;
  max: number;
  metric: "reps" | "seconds";
}): string {
  const { min, max, metric } = params;
  
  // Guard: never render 0 reps or 0 seconds
  if (min <= 0 || max <= 0) {
    return "— (invalid target)";
  }
  
  // Guard: handle min > max (invalid range)
  if (min > max) {
    return "— (invalid range)";
  }
  
  const unit = metric === "seconds" ? "s" : " reps";
  
  // Single value: "12 reps" or "45s"
  if (min === max) {
    return `${min}${unit}`;
  }
  
  // Range: "8–12 reps" or "30–60s"
  return `${min}–${max}${unit}`;
}
