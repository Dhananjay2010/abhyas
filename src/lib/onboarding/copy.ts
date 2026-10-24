/**
 * Copy constants for onboarding flow.
 * Shared with Dev 1 for consistency across features.
 */

import type { InjurySeverity } from "./options";

/**
 * Helper text explaining current vs past injury status.
 * Based on generator behavior:
 * - Current: exercises that load the region are excluded (hard filter)
 * - Past: exercises are not excluded, but prehab is added to warm-up
 */
export const INJURY_STATUS_COPY: Record<InjurySeverity, string> = {
  current: "Hurts or limits you now. We won't give you exercises that load it.",
  past: "Healed, but needs care. We add specific warm-up for it but don't avoid movements.",
};
