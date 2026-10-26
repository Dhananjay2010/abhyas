/**
 * Validate and compute session duration from start/end times.
 * 
 * Handles midnight-crossing sessions (e.g., 23:30 to 00:30).
 * Returns duration in seconds and the end date, or an error message.
 */

export type SessionTimeValidation =
  | {
      success: true;
      durationSeconds: number;
      endDate: string;
    }
  | {
      success: false;
      error: string;
    };

export function validateSessionTimes(
  editedDate: string,
  editedStartTime: string,
  editedEndTime: string
): SessionTimeValidation {
  // Parse times to compare
  const [startHour, startMin] = editedStartTime.split(":").map(Number);
  const [endHour, endMin] = editedEndTime.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  // Check if start == end
  if (startMinutes === endMinutes) {
    return {
      success: false,
      error: "End time must be different from start time",
    };
  }
  
  // Midnight-crossing fix: when end ≤ start, assume end is on the next day
  let durationMinutes: number;
  let endDate: string;
  
  if (endMinutes < startMinutes) {
    // End is on the next calendar day
    durationMinutes = (24 * 60 - startMinutes) + endMinutes;
    // Calculate next day
    const dateParts = editedDate.split("-").map(Number);
    const nextDay = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + 1));
    endDate = nextDay.toISOString().slice(0, 10);
  } else {
    // Same day
    durationMinutes = endMinutes - startMinutes;
    endDate = editedDate;
  }
  
  const MAX_DURATION_HOURS = 10;
  if (durationMinutes > MAX_DURATION_HOURS * 60) {
    return {
      success: false,
      error: "Duration cannot exceed 10 hours",
    };
  }

  return {
    success: true,
    durationSeconds: durationMinutes * 60,
    endDate,
  };
}
