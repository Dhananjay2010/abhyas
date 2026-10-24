import { decideSetWrite } from "./decide-set-write";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type LogSetInput = {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

export type LogSetResult =
  | { ok: true }
  | { ok: false; error: string }
  | {
      ok: false;
      reason: "set_exists";
      savedSets: Array<{
        setNumber: number;
        reps: number | null;
        weightKg: number | null;
        durationSeconds: number | null;
      }>;
    };

/**
 * Core logic for logging a set. Extracted for testability.
 * 
 * - Checks for existing set with is_warmup_set: false filter
 * - Uses decideSetWrite to determine insert/duplicate/conflict
 * - Handles Postgres 23505 race condition
 * - Never calls upsert
 */
export async function logSetCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: LogSetInput,
): Promise<LogSetResult> {
  // Check if a set already exists for this session_exercise_id + set_number + is_warmup_set: false
  const { data: existingSet } = await supabase
    .from("session_sets")
    .select("reps, weight_kg, duration_seconds")
    .eq("session_exercise_id", input.sessionExerciseId)
    .eq("set_number", input.setNumber)
    .eq("is_warmup_set", false)
    .maybeSingle();

  const decision = decideSetWrite(existingSet, {
    reps: input.reps,
    weightKg: input.weightKg,
    durationSeconds: input.durationSeconds,
  });

  if (decision === "duplicate_ok") {
    // Idempotent replay: identical values, accept as success
    return { ok: true };
  }

  if (decision === "conflict") {
    // Existing set with different values: return conflict with saved sets
    const { data: allSets } = await supabase
      .from("session_sets")
      .select("set_number, reps, weight_kg, duration_seconds")
      .eq("session_exercise_id", input.sessionExerciseId)
      .eq("is_warmup_set", false)
      .order("set_number");

    const savedSets = (allSets ?? []).map((s) => ({
      setNumber: s.set_number,
      reps: s.reps,
      weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
      durationSeconds: s.duration_seconds,
    }));

    return {
      ok: false,
      reason: "set_exists",
      savedSets,
    };
  }

  // decision === "insert": proceed with insert
  const { error } = await supabase.from("session_sets").insert({
    session_exercise_id: input.sessionExerciseId,
    user_id: userId,
    set_number: input.setNumber,
    reps: input.reps,
    weight_kg: input.weightKg,
    duration_seconds: input.durationSeconds,
    is_warmup_set: false,
    completed_at: new Date().toISOString(),
  });

  // Race condition: if two requests race, the insert hits the unique constraint (Postgres 23505).
  // Re-read the row, run decideSetWrite again, and return duplicate_ok or conflict.
  if (error && error.code === "23505") {
    const { data: racedSet } = await supabase
      .from("session_sets")
      .select("reps, weight_kg, duration_seconds")
      .eq("session_exercise_id", input.sessionExerciseId)
      .eq("set_number", input.setNumber)
      .eq("is_warmup_set", false)
      .maybeSingle();

    const racedDecision = decideSetWrite(racedSet, {
      reps: input.reps,
      weightKg: input.weightKg,
      durationSeconds: input.durationSeconds,
    });

    if (racedDecision === "duplicate_ok") {
      return { ok: true };
    }

    // Conflict after race: return savedSets
    const { data: allSets } = await supabase
      .from("session_sets")
      .select("set_number, reps, weight_kg, duration_seconds")
      .eq("session_exercise_id", input.sessionExerciseId)
      .eq("is_warmup_set", false)
      .order("set_number");

    const savedSets = (allSets ?? []).map((s) => ({
      setNumber: s.set_number,
      reps: s.reps,
      weightKg: s.weight_kg === null ? null : Number(s.weight_kg),
      durationSeconds: s.duration_seconds,
    }));

    return {
      ok: false,
      reason: "set_exists",
      savedSets,
    };
  }

  return error ? { ok: false, error: error.message } : { ok: true };
}
