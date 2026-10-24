/**
 * Compute yoga/breathing progress stats from completed sessions.
 * 
 * Used for yoga and breathing members on the Progress page (QA M-4).
 * All time calculations use local dates to ensure timezone consistency.
 */

interface CompletedSession {
  local_date: string;
  duration_seconds: number | null;
}

interface YogaStats {
  sessionsThisWeek: number;
  minutesThisWeek: number;
  minutesThisMonth: number;
  sessionsAllTime: number;
}

/**
 * Compute yoga/breathing stats for a member.
 * 
 * @param sessions - Completed sessions with local_date and duration_seconds
 * @param today - Today's date in ISO format (YYYY-MM-DD)
 * @returns Stats: sessions this week, minutes this week, minutes this month, sessions all time
 */
export function computeYogaStats(
  sessions: CompletedSession[],
  today: string
): YogaStats {
  const todayDate = new Date(today + "T00:00:00Z");
  const todayDayOfWeek = todayDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate Monday of this week (ISO week starts on Monday)
  const daysFromMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
  const mondayThisWeek = new Date(todayDate);
  mondayThisWeek.setUTCDate(todayDate.getUTCDate() - daysFromMonday);
  const weekStart = mondayThisWeek.toISOString().split("T")[0];

  // Calculate first day of this month
  const monthStart = today.slice(0, 8) + "01"; // YYYY-MM-01

  let sessionsThisWeek = 0;
  let minutesThisWeek = 0;
  let minutesThisMonth = 0;
  let sessionsAllTime = 0;

  for (const session of sessions) {
    const duration = session.duration_seconds ?? 0;
    sessionsAllTime++;

    if (session.local_date >= weekStart) {
      sessionsThisWeek++;
      minutesThisWeek += duration;
    }

    if (session.local_date >= monthStart) {
      minutesThisMonth += duration;
    }
  }

  return {
    sessionsThisWeek,
    minutesThisWeek: Math.round(minutesThisWeek / 60),
    minutesThisMonth: Math.round(minutesThisMonth / 60),
    sessionsAllTime,
  };
}
