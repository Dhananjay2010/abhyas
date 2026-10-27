/**
 * Core logSet logic with dependency injection for testability.
 * 
 * Extracts auth resolution and expired-result handling so tests can drive
 * the real code path without server action machinery.
 */

import { resolveAuth } from "./auth-result";
import { SESSION_EXPIRED_CODE } from "@/lib/auth/session-expired";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type LogSetDeps = {
  resolveAuth: typeof resolveAuth;
  getAuthedClient: () => Promise<{
    supabase: SupabaseClient<Database>;
    user: { id: string } | null;
  }>;
  checkLogSetInput: (
    supabase: SupabaseClient<Database>,
    userId: string,
    input: { reps: number | null; weightKg: number | null; durationSeconds: number | null }
  ) => Promise<string | null>;
  validateSessionForLogSet: (
    deps: any,
    sessionExerciseId: string,
    set: { setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }
  ) => Promise<
    | { ok: true }
    | { ok: false; error: string }
    | { ok: false; reason: "set_exists"; savedSets: any[] }
  >;
  buildLogSetValidationDeps: (supabase: SupabaseClient<Database>) => any;
  logSetCore: (
    supabase: SupabaseClient<Database>,
    userId: string,
    input: {
      sessionExerciseId: string;
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSeconds: number | null;
    }
  ) => Promise<
    | { ok: true }
    | { ok: false; error: string }
    | { ok: false; reason: "set_exists"; savedSets: any[] }
  >;
};

export type LogSetInput = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
};

export type LogSetResult =
  | { ok: true }
  | { ok: false; error: string; code?: string }
  | { ok: false; reason: "set_exists"; savedSets: any[] };

/**
 * Dependency-injected logSet core. Handles auth resolution and SESSION_EXPIRED.
 * The real server action calls this; tests inject fakes.
 */
export async function logSetWithAuth(
  deps: LogSetDeps,
  input: LogSetInput
): Promise<LogSetResult> {
  return await deps.resolveAuth(
    async () => {
      const { supabase, user } = await deps.getAuthedClient();
      return { user, supabase };
    },
    async ({ user, supabase }) => {
      if (!user) return { ok: false, error: "Generic error" }; // MUTANT: break expired branch

      const invalid = await deps.checkLogSetInput(supabase, user.id, {
        reps: input.reps,
        weightKg: input.weightKg,
        durationSeconds: input.durationSeconds ?? null,
      });
      if (invalid) return { ok: false, error: invalid };

      const durationSeconds = input.durationSeconds ?? null;
      const validationDeps = deps.buildLogSetValidationDeps(supabase);
      const validationResult = await deps.validateSessionForLogSet(
        validationDeps,
        input.sessionExerciseId,
        {
          setNumber: input.setNumber,
          reps: input.reps,
          weightKg: input.weightKg,
          durationSeconds,
        }
      );

      if (!validationResult.ok) {
        return validationResult;
      }

      return deps.logSetCore(supabase, user.id, {
        sessionExerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        reps: input.reps,
        weightKg: input.weightKg,
        durationSeconds,
      });
    }
  );
}
