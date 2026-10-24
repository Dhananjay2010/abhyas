import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SessionExerciseWithStatus = {
  sessions: {
    status: string;
  };
};

export type ValidationResult =
  | { ok: true; status: string }
  | { ok: false; code: "SESSION_NOT_FOUND" | "SESSION_ENDED"; error: string };

export type LogSetValidationDeps = {
  lookupSessionExercise: (
    sessionExerciseId: string
  ) => Promise<SessionExerciseWithStatus | null>;
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
  };
}

export async function validateSessionForLogSet(
  deps: LogSetValidationDeps,
  sessionExerciseId: string
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
    return { 
      ok: false, 
      code: "SESSION_ENDED", 
      error: "This session has ended." 
    };
  }

  return { ok: true, status: sessionStatus };
}
