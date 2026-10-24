/**
 * Shared duration formatter for consistent display across the app.
 * 
 * Used in Breathe, Yoga, and History views to ensure duration labels agree.
 */

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
