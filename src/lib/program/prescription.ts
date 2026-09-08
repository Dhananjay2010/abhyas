import type { Database } from "@/lib/database.types";

type Goal = Database["public"]["Enums"]["fitness_goal"];
type Level = Database["public"]["Enums"]["fitness_level"];

export type Prescription = {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

/**
 * Goal decides rep range and rest. This is the strongest input we collect, and
 * SPEC section 4 fixes these numbers -- do not tune them here without updating it.
 */
const BY_GOAL: Record<Goal, Prescription> = {
  strength: { sets: 4, repsMin: 3, repsMax: 6, restSeconds: 180 },
  muscle_gain: { sets: 4, repsMin: 8, repsMax: 12, restSeconds: 90 },
  fat_loss: { sets: 3, repsMin: 12, repsMax: 15, restSeconds: 50 },
  general_fitness: { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 75 },
  flexibility_stress: { sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 },
};

/** Beginners get less volume; advanced lifters can hold more. */
const SET_ADJUSTMENT: Record<Level, number> = {
  beginner: -1,
  intermediate: 0,
  expert: 0,
};

export function prescribe(
  goal: Goal,
  level: Level,
  isolation: boolean,
): Prescription {
  const base = BY_GOAL[goal];
  const sets = Math.max(2, base.sets + SET_ADJUSTMENT[level]);

  // Isolation work does not need heavy-single rest periods, and strength rep
  // ranges make no sense on a lateral raise.
  if (isolation) {
    return {
      sets: Math.max(2, sets - 1),
      repsMin: Math.max(base.repsMin, 8),
      repsMax: Math.max(base.repsMax, 12),
      restSeconds: Math.min(base.restSeconds, 75),
    };
  }

  return { ...base, sets };
}

/** Week 4 of every block is a deload: less volume, nothing near failure. */
export function applyDeload(p: Prescription): Prescription {
  return {
    sets: Math.max(2, Math.round(p.sets * 0.6)),
    repsMin: p.repsMin,
    repsMax: p.repsMax,
    restSeconds: p.restSeconds,
  };
}
