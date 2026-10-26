import type { Database } from "@/lib/database.types";
import { previousDayResumeHref, type SessionForDetection } from "@/lib/today/session-detection";

export type RestDayResumeDecision = {
  showResume: boolean;
  showSwap: boolean;
  resumeButton:
    | { type: "link"; href: string }
    | { type: "form"; label: string }
    | null;
};

/**
 * Decide whether a rest day should show the Resume button or swap prompt.
 *
 * When a strength session is open (from an earlier day or earlier today),
 * the rest day shows Resume and hides the swap prompt.
 *
 * Returns:
 * - showResume: whether to show the Resume affordance
 * - showSwap: whether to show the swap prompt
 * - resumeButton: how to render the Resume button
 *   - { type: "link", href } for previous-day sessions
 *   - { type: "form", label } for today's sessions (uses startSession)
 *   - null when showResume is false
 */
export function decideRestDayResume(input: {
  dayType: Database["public"]["Enums"]["day_type"];
  strengthOpen: SessionForDetection | undefined;
  localToday: string;
}): RestDayResumeDecision {
  if (input.dayType !== "rest" || !input.strengthOpen) {
    return { showResume: false, showSwap: true, resumeButton: null };
  }

  // Rest day with an open strength session: show Resume, hide swap
  const href = previousDayResumeHref(input.strengthOpen, input.localToday);
  
  if (href) {
    return {
      showResume: true,
      showSwap: false,
      resumeButton: { type: "link", href },
    };
  }

  // Session from today: use the form button
  // The Today page may render this with Start/Resume on a rest day.
  // Though previousDayResumeHref returns null for today's sessions,
  // decideRestDayResume provides the label for StartSessionButton.
  const label = input.strengthOpen.started_at ? "Resume session" : "Start session";
  return {
    showResume: true,
    showSwap: false,
    resumeButton: { type: "form", label },
  };
}
