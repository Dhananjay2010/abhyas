/**
 * Copy constants for onboarding flow.
 * Shared with Dev 1 for consistency across features.
 */

import type { InjurySeverity } from "./options";
import { branding } from "@/lib/branding";

/**
 * Helper text explaining current vs past injury status.
 * Based on generator behavior:
 * - Current: exercises that load the region are excluded (hard filter)
 * - Past: exercises are not excluded, but prehab is added to warm-up
 */
export const INJURY_STATUS_COPY: Record<InjurySeverity, string> = {
  current: "It hurts or limits you right now. We'll leave out exercises that load it.",
  past: "It's healed. We'll keep it in mind, but we won't avoid it.",
};

/**
 * Injury step intro line (appears above body region chips).
 */
export const INJURY_INTRO = "Tell us about any injuries so we can adjust your plan.";

/**
 * Injury disclaimer note (appears below the injury list).
 * Uses the active brand name for white-label deployment.
 */
export const INJURY_DISCLAIMER = `${branding.name} isn't medical advice. If you're in pain, recently injured or had surgery, check with a doctor or physiotherapist before you start.`;
