import type { Database } from "../database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgramWithDays = {
  id: string;
  started_on: string;
  deload_week: number;
  week_offset: number;
  program_days: Array<{
    id: string;
    day_index: number;
    day_type: Database["public"]["Enums"]["day_type"];
    focus: string | null;
    label: string | null;
  }>;
};

export type LoadStartProgramDeps = {
  fetchProgram: (programId: string) => Promise<ProgramWithDays | null>;
};

export type LoadStartProgramResult =
  | { ok: true; program: ProgramWithDays; dayId: string }
  | { ok: false; error: string };

export async function loadStartProgram(
  deps: LoadStartProgramDeps,
  programId: string,
  dayIndex: number,
): Promise<LoadStartProgramResult> {
  const program = await deps.fetchProgram(programId);

  if (!program) {
    return { ok: false, error: "No plan for today." };
  }

  const day = program.program_days.find((d) => d.day_index === dayIndex);

  if (!day) {
    return { ok: false, error: "No plan for today." };
  }

  return { ok: true, program, dayId: day.id };
}

export function createSupabaseDeps(client: SupabaseClient<Database>): LoadStartProgramDeps {
  return {
    async fetchProgram(programId: string) {
      const { data } = await client
        .from("programs")
        .select("id, started_on, deload_week, week_offset, program_days(id, day_index, day_type, focus, label)")
        .eq("program_days.status", "active")
        .eq("id", programId)
        .maybeSingle();
      
      return data;
    },
  };
}
