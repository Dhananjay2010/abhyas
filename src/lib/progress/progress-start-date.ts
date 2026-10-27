/**
 * Compute the start date for Progress day records.
 * 
 * Fix pd-b: Start from the EARLIER of the first non-superseded block's started_on
 * and the first completed session's local_date, so completed sessions always count
 * toward Days trained even if a block was incorrectly marked superseded.
 */

export function progressStartDate(input: {
  programs: Array<{ startedOn: string }>;
  completedSessions: Array<{ local_date: string }>;
}): string | null {
  const { programs, completedSessions } = input;

  const firstSessionDate = completedSessions.length > 0
    ? completedSessions.reduce((earliest, s) => 
        s.local_date < earliest ? s.local_date : earliest, 
        completedSessions[0].local_date
      )
    : null;

  const firstBlockDate = programs.length > 0 ? programs[0].startedOn : null;

  if (!firstSessionDate && !firstBlockDate) return null;
  if (!firstSessionDate) return firstBlockDate;
  if (!firstBlockDate) return firstSessionDate;
  
  return firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate;
}
