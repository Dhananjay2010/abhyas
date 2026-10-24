/**
 * Onboarding draft persistence via localStorage.
 * Saves form state on every change, keyed by user ID.
 * Cleared on successful completion.
 */

import type { BodyRegion, Goal, InjurySeverity, Level, Sex, Track } from "./options";

export type OnboardingDraft = {
  dateOfBirth: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  goal: Goal | null;
  level: Level | null;
  location: "gym" | "home" | null;
  homeTrack: Track | null;
  daysPerWeek: number | null;
  yogaDays: number;
  sessionLength: number | null;
  hasAllEquipment: boolean;
  selectedEquipment: string[];
  injuries: Array<{ bodyRegion: BodyRegion; severity: InjurySeverity | null }>;
  stepIndex: number;
};

const DRAFT_KEY = "onboarding_draft";

/**
 * Save onboarding draft to localStorage.
 * Safe to call on every change - localStorage is synchronous and fast.
 * Uses a single key since only one user can be logged in per browser.
 */
export function saveDraft(draft: OnboardingDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    // localStorage might be full or disabled - silently fail
    console.warn("Failed to save onboarding draft:", err);
  }
}

/**
 * Load onboarding draft from localStorage.
 * Returns null if no draft exists or if it's invalid.
 */
export function loadDraft(): OnboardingDraft | null {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as OnboardingDraft;
  } catch (err) {
    console.warn("Failed to load onboarding draft:", err);
    return null;
  }
}

/**
 * Clear onboarding draft from localStorage.
 * Call this on successful completion.
 */
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    console.warn("Failed to clear onboarding draft:", err);
  }
}

/**
 * Check if localStorage is available.
 * Useful for SSR environments.
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const test = "__ls_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
