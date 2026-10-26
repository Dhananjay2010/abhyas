import type { Database } from "@/lib/database.types";
import { previousDayResumeHref, type SessionForDetection } from "@/lib/today/session-detection";

export type RestDayResumeDecision = {
  showResume: boolean;
  showSwap: boolean;
  resumeHref: string | null;
};

/**
 * Decide whether a rest day should show the Resume button or swap prompt.
 *
 * When a strength session is open (from an earlier day or earlier today),
 * the rest day shows Resume and hides the swap prompt.
 */
export function decideRestDayResume(input: {
  dayType: Database["public"]["Enums"]["day_type"];
  strengthOpen: SessionForDetection | undefined;
  localToday: string;
}): RestDayResumeDecision {
  if (input.dayType !== "rest" || !input.strengthOpen) {
    return { showResume: false, showSwap: true, resumeHref: null };
  }

  // Rest day with an open strength session: show Resume, hide swap
  const href = previousDayResumeHref(input.strengthOpen, input.localToday);
  return {
    showResume: true,
    showSwap: false,
    resumeHref: href,
  };
}
