import type { Database } from "@/lib/database.types";

type SplitType = Database["public"]["Enums"]["split_type"];
type Pattern = Database["public"]["Enums"]["movement_pattern"];

export type DayTemplate = {
  focus: string;
  label: string;
  /** Slots are filled in order, so put the compound work first. */
  slots: Pattern[];
};

/** SPEC section 6: days per week picks the split. */
export function splitFor(trainingDays: number): SplitType {
  if (trainingDays <= 3) return "full_body";
  if (trainingDays === 4) return "upper_lower";
  return "ppl";
}

const FULL_BODY_A: DayTemplate = {
  focus: "full_body",
  label: "Full Body A",
  slots: ["squat", "horizontal_press", "horizontal_pull", "core"],
};
const FULL_BODY_B: DayTemplate = {
  focus: "full_body",
  label: "Full Body B",
  slots: ["hinge", "vertical_press", "vertical_pull", "core"],
};
const FULL_BODY_C: DayTemplate = {
  focus: "full_body",
  label: "Full Body C",
  slots: ["lunge", "horizontal_press", "horizontal_pull", "calf"],
};

const UPPER: DayTemplate = {
  focus: "upper",
  label: "Upper",
  slots: ["horizontal_press", "vertical_pull", "vertical_press", "horizontal_pull", "triceps", "biceps"],
};
const LOWER: DayTemplate = {
  focus: "lower",
  label: "Lower",
  slots: ["squat", "hinge", "lunge", "calf", "core"],
};

const PUSH: DayTemplate = {
  focus: "push",
  label: "Push",
  slots: ["horizontal_press", "vertical_press", "horizontal_press", "lateral_delt", "triceps"],
};
const PULL: DayTemplate = {
  focus: "pull",
  label: "Pull",
  slots: ["vertical_pull", "horizontal_pull", "horizontal_pull", "rear_delt", "biceps"],
};
const LEGS: DayTemplate = {
  focus: "legs",
  label: "Legs",
  slots: ["squat", "hinge", "lunge", "calf", "core"],
};

/** The ordered training days for a block, before rest and yoga are woven in. */
export function templatesFor(trainingDays: number): DayTemplate[] {
  switch (trainingDays) {
    case 1:
      return [FULL_BODY_A];
    case 2:
      return [FULL_BODY_A, FULL_BODY_B];
    case 3:
      return [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C];
    case 4:
      return [UPPER, LOWER, UPPER, LOWER];
    case 5:
      return [PUSH, PULL, LEGS, UPPER, LOWER];
    default:
      return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
  }
}

/** Which weekday indices (1 = Monday) are active, for a given number of active days. */
export function activeDayIndices(activeDays: number): number[] {
  switch (activeDays) {
    case 3:
      return [1, 3, 5];
    case 4:
      return [1, 2, 4, 5];
    case 5:
      return [1, 2, 3, 5, 6];
    case 6:
      return [1, 2, 3, 4, 6, 7];
    default:
      return Array.from({ length: Math.min(activeDays, 7) }, (_, i) => i + 1);
  }
}

const LEG_FOCUSES = new Set(["legs", "lower"]);

/**
 * Place yoga among the active days, keeping it away from the heaviest leg day
 * (SPEC section 6) -- a yoga session the morning after heavy squats is where
 * people hurt themselves.
 */
export function placeYoga(
  templates: DayTemplate[],
  yogaDays: number,
): (DayTemplate | "yoga")[] {
  const plan: (DayTemplate | "yoga")[] = [...templates];
  if (yogaDays <= 0) return plan;

  for (let placed = 0; placed < yogaDays; placed++) {
    // Prefer the position furthest from any leg day.
    let bestIndex = plan.length;
    let bestDistance = -1;

    for (let i = 0; i <= plan.length; i++) {
      const before = plan[i - 1];
      const after = plan[i];
      const touchesLegs =
        (before && before !== "yoga" && LEG_FOCUSES.has(before.focus)) ||
        (after && after !== "yoga" && LEG_FOCUSES.has(after.focus));
      const distance = touchesLegs ? 0 : 1;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        if (distance === 1) break;
      }
    }
    plan.splice(bestIndex, 0, "yoga");
  }

  return plan;
}
