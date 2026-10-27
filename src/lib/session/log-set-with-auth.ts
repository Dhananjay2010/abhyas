/**
 * Core logSet logic with dependency injection for testability.
 * 
 * Uses the real resolveAuth, but injects other dependencies like getAuthedClient
 * so tests can drive the real auth-resolution code path.
 */

import { resolveAuth } from "./auth-result";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type LogSetCoreDeps = {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deps: any,
    sessionExerciseId: string,
    set: { setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }
  ) => Promise<
    | { ok: true }
    | { ok: false; error: string }
    | { ok: false; reason: "set_exists"; savedSets: any[] } // eslint-disable-line @typescript-eslint/no-explicit-any
  >;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    | { ok: false; reason: "set_exists"; savedSets: any[] } // eslint-disable-line @typescript-eslint/no-explicit-any
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
 * Dependency-injected logSet core. Uses REAL resolveAuth for SESSION_EXPIRED handling.
 * Tests inject fake getAuthedClient/checkLogSetInput/logSetCore but drive real auth resolution.
 */
export async function logSetWithAuth(
  deps: LogSetCoreDeps,
  input: LogSetInput
): Promise<LogSetResult> {
  return await resolveAuth(
    async () => {
      const { supabase, user } = await deps.getAuthedClient();
      return { user, supabase };
    },
    async ({ user, supabase }) => {
      if (!user) throw new Error("Not signed in");

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
