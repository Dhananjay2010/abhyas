/**
 * Shared duration formatter for consistent display across the app.
 * 
 * Used in Breathe, Yoga, and History views to ensure duration labels agree.
 */

/**
 * Format seconds as "m:ss" (for countdowns and timers).
 * Examples: "0:38", "1:05", "12:30"
 */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Format seconds as human-readable duration text.
 * Examples: "Under a minute", "1 min", "2 min"
 * 
 * This is the canonical formatter for displaying completed durations.
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return "0 min";
  if (totalSeconds < 60) return "Under a minute";
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
}

/**
 * Format seconds as human-readable duration text for weekly stats.
 * Examples: "Nothing yet this week", "Under a minute this week", "12 min this week"
 */
export function formatWeekDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return "Nothing yet this week";
  if (totalSeconds < 60) return "Under a minute this week";
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min this week`;
}
