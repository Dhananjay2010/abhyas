/**
 * Pure helper functions for date of birth validation.
 *
 * No dependencies on Next.js, server actions, or Supabase.
 * Reusable across onboarding and settings.
 */

const MIN_AGE_YEARS = 16;
const MAX_AGE_YEARS = 100;

/**
 * Parse day, month, year into ISO date string (YYYY-MM-DD).
 * Returns null if invalid calendar date (e.g., 31/02, 29/02/1999).
 * All dates are local (no UTC shift).
 */
export function parseDobParts(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1000) return null;

  // Create local date and verify it's valid
  const date = new Date(y, m - 1, d);
  if (date.getDate() !== d || date.getMonth() !== m - 1 || date.getFullYear() !== y) {
    return null; // Invalid calendar date (e.g., 31/02, 29/02 in non-leap year)
  }

  // Return ISO format
  const dayStr = String(d).padStart(2, '0');
  const monthStr = String(m).padStart(2, '0');
  const yearStr = String(y).padStart(4, '0');
  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * Validate ISO date of birth against today.
 * Returns null if valid, or an error code.
 *
 * @param iso - ISO date string (YYYY-MM-DD)
 * @param todayIso - Today's date as ISO string (YYYY-MM-DD)
 */
export function validateDob(iso: string, todayIso: string): null | 'future' | 'under16' | 'over100' | 'invalid' {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'invalid';

  // Parse as local dates (no UTC shift)
  const [year, month, day] = iso.split('-').map(Number);
  const dobDate = new Date(year, month - 1, day);

  if (isNaN(dobDate.getTime())) return 'invalid';
  if (dobDate.getDate() !== day || dobDate.getMonth() !== month - 1 || dobDate.getFullYear() !== year) {
    return 'invalid';
  }

  const [todayYear, todayMonth, todayDay] = todayIso.split('-').map(Number);
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  today.setHours(0, 0, 0, 0);
  dobDate.setHours(0, 0, 0, 0);

  // Check future
  if (dobDate >= today) return 'future';

  // Check age bounds
  const maxDate = new Date(today);
  maxDate.setFullYear(today.getFullYear() - MIN_AGE_YEARS);

  const minDate = new Date(today);
  minDate.setFullYear(today.getFullYear() - MAX_AGE_YEARS);

  if (dobDate > maxDate) return 'under16';
  if (dobDate < minDate) return 'over100';

  return null;
}

/**
 * Get error message for validation result.
 */
export function getDobErrorMessage(error: 'future' | 'under16' | 'over100' | 'invalid'): string {
  switch (error) {
    case 'future':
      return "Date can't be in the future";
    case 'under16':
      return "You must be at least 16 years old";
    case 'over100':
      return "Please check your date of birth";
    case 'invalid':
      return "Please enter a valid date";
  }
}
