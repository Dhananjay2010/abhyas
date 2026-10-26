/**
 * Decide whether to load plannable days for the Today page.
 *
 * We load them in two cases:
 * 1. Yesterday was missed and today is still changeable (askAboutToday).
 * 2. Today is a rest day with no open strength session, so "Or train today anyway"
 *    can list strength days.
 *
 * We DON'T load them when:
 * - Today is a rest day AND a strength session from an earlier day is open.
 *   In that case, the rest day shows Resume (like training days do), not swap options.
 */
export function shouldLoadPlannableDays(params: {
  askAboutToday: boolean;
  dayType: string | null;
  strengthOpen?: boolean;
}): boolean {
  const { askAboutToday, dayType, strengthOpen = false } = params;

  // Missed yesterday always prompts, even with an open session
  if (askAboutToday) return true;

  // Rest day with an open strength session shows Resume, not swap
  if (dayType === "rest" && strengthOpen) return false;

  // Rest day with no open session offers swap
  return dayType === "rest";
}
