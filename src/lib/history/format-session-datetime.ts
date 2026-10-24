import { formatInTimezone } from "@/lib/timezone";

/**
 * Format a session's date and time for display in History.
 * 
 * TZ-2 fix: Show both date and time from started_at in the current zone
 * (not a mix of local_date and started_at). Falls back to local_date only
 * when started_at is null. Shows the year when the date isn't in the current year.
 * 
 * For "Today", shows "Today · 1:07 am" instead of just "Today".
 * For "Yesterday", shows "Yesterday · 1:07 am" if a label exists.
 * 
 * @param startedAt - ISO timestamp when session started (can be null)
 * @param localDate - Stored local date (ISO format: YYYY-MM-DD)
 * @param timezone - IANA timezone string for formatting
 * @param today - Today's date in YYYY-MM-DD format for comparison
 * @returns Formatted date/time string (e.g. "Today · 7:00 am" or "Sat 24 Oct · 7:00 am")
 */
export function formatSessionDateTime(
  startedAt: string | null,
  localDate: string,
  timezone: string,
  today?: string
): string {
  if (startedAt) {
    // Format both date and time from started_at in the current zone
    const date = new Date(startedAt);
    const currentYear = new Date().getFullYear();
    const sessionYear = parseInt(formatInTimezone(date, timezone, { year: "numeric" }), 10);
    const includeYear = sessionYear !== currentYear;

    const timePart = formatInTimezone(date, timezone, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    })
      .replace(/\sAM$/, " am")
      .replace(/\sPM$/, " pm");

    // Check if this is today or yesterday
    if (today) {
      if (localDate === today) {
        return `Today · ${timePart}`;
      }
      
      // Check if yesterday
      const yesterdayDate = new Date(today + "T00:00:00Z");
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
      const yesterday = yesterdayDate.toISOString().split("T")[0];
      
      if (localDate === yesterday) {
        return `Yesterday · ${timePart}`;
      }
    }

    const dateFormat: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    };

    if (includeYear) {
      dateFormat.year = "numeric";
    }

    const datePart = formatInTimezone(date, timezone, dateFormat);

    return `${datePart} · ${timePart}`;
  }

  // Fall back to local_date when started_at is null
  const [y, m, d] = localDate.split("-").map(Number);
  const currentYear = new Date().getFullYear();
  const includeYear = y !== currentYear;

  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  };

  if (includeYear) {
    options.year = "numeric";
  }

  return new Intl.DateTimeFormat("en-GB", options).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}
