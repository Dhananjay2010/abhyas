import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decideSetWrite } from "./decide-set-write";

type Client = SupabaseClient<Database>;

export type SessionExerciseWithStatus = {
  sessions: {
    status: string;
  };
};

export type ExistingSetRow = {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

export type ValidationResult =
  | { ok: true; status: string }
  | { ok: false; code: "SESSION_NOT_FOUND" | "SESSION_ENDED"; error: string };

export type LogSetValidationDeps = {
  lookupSessionExercise: (
    sessionExerciseId: string
  ) => Promise<SessionExerciseWithStatus | null>;
  lookupExistingSet: (
    sessionExerciseId: string,
    setNumber: number
  ) => Promise<ExistingSetRow | null>;
};

export function buildLogSetValidationDeps(
  supabase: Client
): LogSetValidationDeps {
  return {
    lookupSessionExercise: async (sessionExerciseId: string) => {
      const { data, error } = await supabase
        .from("session_exercises")
        .select("sessions!inner(status)")
        .eq("id", sessionExerciseId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    lookupExistingSet: async (sessionExerciseId: string, setNumber: number) => {
      const { data, error } = await supabase
        .from("session_sets")
        .select("reps, weight_kg, duration_seconds")
        .eq("session_exercise_id", sessionExerciseId)
        .eq("set_number", setNumber)
        .eq("is_warmup_set", false)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  };
}

export async function validateSessionForLogSet(
  deps: LogSetValidationDeps,
  sessionExerciseId: string,
  setInput: {
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
  }
): Promise<ValidationResult> {
  let sessionExercise: SessionExerciseWithStatus | null;
  
  try {
    sessionExercise = await deps.lookupSessionExercise(sessionExerciseId);
  } catch {
    return { 
      ok: false, 
      code: "SESSION_NOT_FOUND", 
      error: "Session not found." 
    };
  }

  if (!sessionExercise) {
    return { 
      ok: false, 
      code: "SESSION_NOT_FOUND", 
      error: "Session not found." 
    };
  }

  const sessionStatus = sessionExercise.sessions.status;
  if (sessionStatus !== "in_progress") {
    let existingSet: ExistingSetRow | null;
    try {
      existingSet = await deps.lookupExistingSet(sessionExerciseId, setInput.setNumber);
    } catch {
      return { 
        ok: false, 
        code: "SESSION_ENDED", 
        error: "This session has ended." 
      };
    }

    if (existingSet) {
      const decision = decideSetWrite(existingSet, {
        reps: setInput.reps,
        weightKg: setInput.weightKg,
        durationSeconds: setInput.durationSeconds,
      });
      
      if (decision === "duplicate_ok") {
        return { ok: true, status: sessionStatus };
      }
    }
    
    return { 
      ok: false, 
      code: "SESSION_ENDED", 
      error: "This session has ended." 
    };
  }

  return { ok: true, status: sessionStatus };
}
