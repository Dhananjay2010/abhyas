/**
 * Pure step validation functions for onboarding flow.
 * Each function takes the step's form state and returns { valid: boolean; reason?: string }.
 * Used to disable Continue and show helper text until the step is complete.
 */

import type { Sex, Goal, Level, Track, BodyRegion, InjurySeverity } from "./options";

export type ValidationResult = {
  valid: boolean;
  reason?: string;
};

/**
 * Validate the About You step.
 */
export function validateAboutStep(state: {
  dateOfBirth: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
}): ValidationResult {
  const { dateOfBirth, sex, heightCm, weightKg } = state;

  // Date of birth validation
  if (dateOfBirth === "") {
    return { valid: false, reason: "Please enter your date of birth" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return { valid: false, reason: "Date format should be YYYY-MM-DD" };
  }
  const date = new Date(dateOfBirth);
  if (isNaN(date.getTime())) {
    return { valid: false, reason: "Invalid date" };
  }
  const year = date.getFullYear();
  if (year < 1000 || year > 9999 || year < 1900 || year > new Date().getFullYear()) {
    return { valid: false, reason: "Date should be between 1900 and today" };
  }
  if (date > new Date()) {
    return { valid: false, reason: "Date cannot be in the future" };
  }

  // Sex validation
  if (sex === null) {
    return { valid: false, reason: "Please select your biological sex" };
  }

  // Height validation
  if (heightCm === "") {
    return { valid: false, reason: "Please enter your height" };
  }
  const height = Number(heightCm);
  if (!Number.isFinite(height) || height < 100 || height > 250) {
    return { valid: false, reason: "Height should be between 100 and 250 cm" };
  }

  // Weight validation
  if (weightKg === "") {
    return { valid: false, reason: "Please enter your weight" };
  }
  const weight = Number(weightKg);
  if (!Number.isFinite(weight) || weight < 25 || weight > 300) {
    return { valid: false, reason: "Weight should be between 25 and 300 kg" };
  }

  return { valid: true };
}

/**
 * Validate the Goal step.
 */
export function validateGoalStep(state: { goal: Goal | null }): ValidationResult {
  if (state.goal === null) {
    return { valid: false, reason: "Please select your primary goal" };
  }
  return { valid: true };
}

/**
 * Validate the Level step.
 */
export function validateLevelStep(state: { level: Level | null }): ValidationResult {
  if (state.level === null) {
    return { valid: false, reason: "Please select your training level" };
  }
  return { valid: true };
}

/**
 * Validate the Track step (gym/home location).
 */
export function validateTrackStep(state: {
  location: "gym" | "home" | null;
  homeTrack: Track | null;
}): ValidationResult {
  const { location, homeTrack } = state;
  if (location === null) {
    return { valid: false, reason: "Please select where you'll train" };
  }
  if (location === "home" && homeTrack === null) {
    return { valid: false, reason: "Please select your home training approach" };
  }
  return { valid: true };
}

/**
 * Validate the Days step.
 */
export function validateDaysStep(state: { daysPerWeek: number | null }): ValidationResult {
  if (state.daysPerWeek === null) {
    return { valid: false, reason: "Please select how many days per week you'll train" };
  }
  return { valid: true };
}

/**
 * Validate the Mix step (yoga days).
 */
export function validateMixStep(_state: { yogaDaysPerWeek: number }): ValidationResult {
  // Yoga is optional; always valid
  return { valid: true };
}

/**
 * Validate the Equipment step.
 */
export function validateEquipmentStep(state: {
  hasAllEquipment: boolean;
  selectedEquipment: Set<string>;
}): ValidationResult {
  const { hasAllEquipment, selectedEquipment } = state;
  if (!hasAllEquipment && selectedEquipment.size === 0) {
    return {
      valid: false,
      reason: 'Please select your equipment or choose "I have access to everything"',
    };
  }
  return { valid: true };
}

/**
 * Validate the Injuries step.
 */
export function validateInjuriesStep(state: {
  injuries: Map<BodyRegion, InjurySeverity | null>;
}): ValidationResult {
  const { injuries } = state;
  // Check if any injury has null severity (user selected region but didn't choose current/past)
  for (const [_region, severity] of injuries.entries()) {
    if (severity === null) {
      return {
        valid: false,
        reason: "Please choose Current or Past for all selected injuries",
      };
    }
  }
  return { valid: true };
}
