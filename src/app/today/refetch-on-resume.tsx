"use client";

import { useResumeRefresh } from "@/lib/session/use-resume-refresh";

/**
 * Client component that refetches Today page data when the user returns
 * (via Back button, tab switch, or window focus).
 * 
 * This ensures Today shows the current Resume/Start state after logging
 * sets in another tab or navigating away and back.
 * 
 * Case B1-A: Today briefly showed 'Start session' instead of 'Resume' after
 * leaving a workout, which risks creating a duplicate session.
 */
export function RefetchOnResume() {
  useResumeRefresh();
  return null;
}
