/**
 * Decide whether to load plannable days for the Today page.
 *
 * We load them in two cases:
 * 1. Yesterday was missed and today is still changeable (askAboutToday).
 * 2. Today is a rest day, so "Or train today anyway" can list strength days.
 *
 * Without case 2, the rest-day prompt shows only Yoga/Breathing/Never mind.
 */
export function shouldLoadPlannableDays(params: {
  missedYesterday: boolean;
  strengthDone: boolean;
  strengthOpen: boolean;
  dayType: string | null;
}): boolean {
  const { missedYesterday, strengthDone, strengthOpen, dayType } = params;

  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;
  const todayIsRest = dayType === "rest";

  return askAboutToday || todayIsRest;
}
