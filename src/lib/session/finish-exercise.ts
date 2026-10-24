import type { Database } from "@/lib/database.types";
import type { FinishExerciseDeps } from "./finish-exercise-deps";

type SetFeel = Database["public"]["Enums"]["set_feel"];

export type ProgressionFeedback = {
  outcome: string;
  message: string;
  personalBest: string | null;
};

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export interface FinishExerciseDepsExt {
  applyProgression: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    userId: string,
    sessionExerciseId: string,
    feel: SetFeel | null,
  ) => Promise<ProgressionFeedback | null>;
}

/**
 * Core idempotent exercise completion logic.
 *
 * Extracted from the server action for testability. Only the first call that
 * transitions from pending to completed/skipped applies progression. Concurrent
 * or repeated calls return success without double-applying.
 */
export async function finishExerciseCore(
  deps: FinishExerciseDeps,
  userId: string,
  input: {
    sessionExerciseId: string;
    feel: SetFeel | null;
    skipped?: boolean;
  },
  depsExt: FinishExerciseDepsExt,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Result<ProgressionFeedback | null>> {
  /*
    Conditional update: only transition rows that are not already finished.
    
    session_exercises.status is NOT NULL with a default ('pending'), per
    20260908090000_initial_schema.sql line 314:
      status  exercise_status not null default 'pending'
    
    So a simple `NOT IN` is safe - it excludes only completed/skipped rows,
    never NULL. If the exercise was already finished, zero rows are updated and
    the RETURNING clause gives back an empty array. That's the idempotency
    check: the first call wins the transition and runs progression; every
    subsequent call sees no row and skips it.
    
    Using `.single()` here would throw on the second call, which is exactly the
    wrong behavior for an idempotent action — a retry or double-tap would fail
    rather than succeed quietly. So we use the array form and check its length.
  */
  const { data, error } = await deps.updateExercise(input.sessionExerciseId, {
    status: input.skipped ? "skipped" : "completed",
    feel: input.feel,
    completed_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error };

  // No row returned: the exercise was already finished by a prior call.
  if (!data) {
    return { ok: true, data: null };
  }

  if (input.skipped) return { ok: true, data: null };

  const feedback = await depsExt.applyProgression(supabase, userId, input.sessionExerciseId, input.feel);
  return { ok: true, data: feedback };
}
