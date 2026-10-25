/**
 * Pure core of logSet server action for testability.
 * A1: This uses resolveAuth so expired sessions return SESSION_EXPIRED result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { resolveAuth } from "./auth-result";
import { logSetCore } from "./log-set-core";
import { buildLogSetValidationDeps, validateSessionForLogSet } from "./log-set-validation";

type AuthResult = Awaited<ReturnType<typeof resolveAuth>>;

export interface LogSetActionDeps {
  getAuthResult: () => Promise<AuthResult>;
  getClient: (userId: string) => SupabaseClient<Database>;
}

export type LogSetActionInput = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
};

export type LogSetActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string }
  | { ok: false; reason: "set_exists"; savedSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null }> };

export async function logSetActionCore(
  deps: LogSetActionDeps,
  input: LogSetActionInput
): Promise<LogSetActionResult> {
  const authResult = await deps.getAuthResult();
  
  if (!authResult.ok) {
    return authResult;
  }

  const { user } = authResult;
  const supabase = deps.getClient(user.id);

  const validationDeps = buildLogSetValidationDeps(supabase);
  const validation = await validateSessionForLogSet(
    validationDeps,
    user.id,
    input.sessionExerciseId
  );

  if (!validation.ok) {
    return validation;
  }

  const { session, sessionExercise } = validation;

  return await logSetCore(
    supabase,
    user.id,
    session.id,
    input.sessionExerciseId,
    input.setNumber,
    input.reps,
    input.weightKg,
    input.durationSeconds ?? null
  );
}
