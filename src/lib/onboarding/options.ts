import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export type Goal = Enums["fitness_goal"];
export type Level = Enums["fitness_level"];
export type Track = Enums["track_type"];
export type Sex = Enums["sex_type"];
export type BodyRegion = Enums["body_region"];
export type InjurySeverity = Enums["injury_severity"];

export type Option<T> = { value: T; label: string; description?: string };

/** Goal drives rep ranges and rest times -- the strongest single signal we collect. */
export const GOALS: Option<Goal>[] = [
  {
    value: "fat_loss",
    label: "Lose fat",
    description: "12–15 reps, short rests. Circuits and supersets to keep the pace up.",
  },
  {
    value: "muscle_gain",
    label: "Build muscle",
    description: "8–12 reps, 90 seconds rest. Compounds first, then isolation work.",
  },
  {
    value: "strength",
    label: "Get stronger",
    description: "3–6 reps, long rests. Heavy compound lifts, lower total volume.",
  },
  {
    value: "general_fitness",
    label: "General fitness",
    description: "8–12 reps, balanced. A bit of everything, nothing extreme.",
  },
  {
    value: "flexibility_stress",
    label: "Flexibility and stress",
    description: "Yoga and mobility led, with breathing work through the week.",
  },
];

export const LEVELS: Option<Level>[] = [
  {
    value: "beginner",
    label: "Beginner",
    description: "New to this, or coming back after a long break. Under six months of consistent training.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Six months to two years. You know the main lifts and can push yourself safely.",
  },
  {
    value: "expert",
    label: "Advanced",
    description: "Two years or more. You know your numbers and how your body responds.",
  },
];

export const HOME_TRACKS: Option<Track>[] = [
  {
    value: "bodyweight",
    label: "Bodyweight",
    description: "Push-ups, squats, rows. Progress by moving to harder variations.",
  },
  {
    value: "yoga",
    label: "Yoga",
    description: "Follow a Yoga with Adriene series, one video at a time.",
  },
  {
    value: "meditation",
    label: "Breathing and meditation",
    description: "Guided breathing patterns with a visual pacer. No physical training.",
  },
];

export const SEXES: Option<Sex>[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const BODY_REGIONS: Option<BodyRegion>[] = [
  { value: "neck", label: "Neck" },
  { value: "shoulder", label: "Shoulder" },
  { value: "elbow", label: "Elbow" },
  { value: "wrist", label: "Wrist" },
  { value: "upper_back", label: "Upper back" },
  { value: "lower_back", label: "Lower back" },
  { value: "core", label: "Core / abdomen" },
  { value: "hip", label: "Hip" },
  { value: "knee", label: "Knee" },
  { value: "ankle", label: "Ankle" },
];

/** Days per week -> split, exactly as specified. Shown to the user so the plan is legible. */
export const SPLIT_BY_DAYS: Record<number, string> = {
  1: "Full body, once a week",
  2: "Full body, twice a week",
  3: "Full body, three times a week",
  4: "Upper / lower, twice each",
  5: "Push, pull, legs, upper, lower",
  6: "Push, pull, legs — twice through",
};

/**
 * The split the generator will actually produce.
 *
 * It is chosen by TRAINING days, not total days, so a hint keyed off
 * days-per-week alone promises "Upper / lower" to someone who picked 4 days
 * with 1 yoga day and then receives Full Body.
 */
export function splitLabelFor(daysPerWeek: number, yogaDays: number): string {
  const training = Math.max(1, daysPerWeek - Math.min(yogaDays, daysPerWeek - 1));
  // Every reachable value of `training` (1..6) has an entry above. The
  // fallback existed for 1 and 2, and read "Full body, 1 times a week" —
  // which is what someone picking 4 days with 3 of them yoga was shown.
  return SPLIT_BY_DAYS[training] ?? "Full body";
}

export const SESSION_LENGTHS: Option<number>[] = [
  {
    value: 30,
    label: "30 minutes",
    description: "Main lifts only. Quick and focused.",
  },
  {
    value: 45,
    label: "45 minutes (default)",
    description: "Main lifts plus accessories. Balanced.",
  },
  {
    value: 60,
    label: "60 minutes",
    description: "Full workout with more variety.",
  },
  {
    value: 75,
    label: "75 minutes",
    description: "Extended sessions for advanced training.",
  },
  {
    value: 90,
    label: "90 minutes",
    description: "Maximum volume and exercise selection.",
  },
];

export const MIN_AGE_YEARS = 16;

export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    on.getMonth() < dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
