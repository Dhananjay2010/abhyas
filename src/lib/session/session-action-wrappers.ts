/**
 * Testable action wrappers for session operations.
 * These are NOT server actions - they're pure functions that can be tested.
 * The actual server actions in actions.ts import and call these.
 */

import type { Result } from "@/lib/result";
import type { SetFeel } from "@/lib/database.types";
import type { ProgressionFeedback } from "@/lib/progression/apply";
import { finishSessionCore } from "./finish-session";
import { makeFinishSessionDeps } from "./finish-session-deps";
import { abandonSessionCore } from "./abandon-session";
import { makeAbandonSessionDeps } from "./abandon-session-deps";
import { finishExerciseCore } from "./finish-exercise";
import { makeFinishExerciseDeps } from "./finish-exercise-deps";

type SupabaseClient = any; // Will be properly typed by caller

export async function finishSessionAction(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    durationSeconds: number;
    cooldownCompleted: boolean;
  }
): Promise<Result<{ status: "completed" | "skipped" }>> {
  return await finishSessionCore(makeFinishSessionDeps(supabase), input);
}

export async function abandonSessionAction(
  supabase: SupabaseClient,
  sessionId: string,
  elapsedSeconds: number,
): Promise<Result> {
  const deps = makeAbandonSessionDeps(supabase);
  return await abandonSessionCore(deps, sessionId, elapsedSeconds);
}

export async function finishExerciseAction(
  supabase: SupabaseClient,
  userId: string,
  input: {
    sessionExerciseId: string;
    feel: SetFeel | null;
    skipped?: boolean;
  },
  applyProgressionFn: (
    supabase: SupabaseClient,
    userId: string,
    sessionExerciseId: string,
    feel: SetFeel | null,
  ) => Promise<ProgressionFeedback | null>
): Promise<Result<ProgressionFeedback | null>> {
  const deps = makeFinishExerciseDeps(supabase, applyProgressionFn);
  return finishExerciseCore(deps, userId, input);
}
