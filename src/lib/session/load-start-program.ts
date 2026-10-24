import type { Database } from "../database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgramDay = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  focus: string | null;
  label: string | null;
};

export type ProgramWithDays = {
  id: string;
  started_on: string;
  deload_week: number;
  week_offset: number;
  program_days: ProgramDay[];
};

export type LoadStartProgramDeps = {
  fetchProgram: (programId: string) => Promise<{ data: ProgramWithDays | null; error: { message: string } | null }>;
};

export type LoadStartProgramResult =
  | { ok: true; program: ProgramWithDays; day: ProgramDay }
  | { ok: false; error: string };

export async function loadStartProgram(
  deps: LoadStartProgramDeps,
  programId: string,
  dayIndex: number,
): Promise<LoadStartProgramResult> {
  const { data: program, error } = await deps.fetchProgram(programId);

  if (error) {
    return { ok: false, error: "Could not load the training block." };
  }

  if (!program) {
    return { ok: false, error: "No plan for today." };
  }

  const day = program.program_days.find((d) => d.day_index === dayIndex);

  if (!day) {
    return { ok: false, error: "No plan for today." };
  }

  return { ok: true, program, day };
}

export function createSupabaseDeps(client: SupabaseClient<Database>): LoadStartProgramDeps {
  return {
    async fetchProgram(programId: string) {
      const { data, error } = await client
        .from("programs")
        .select("id, started_on, deload_week, week_offset, program_days(id, day_index, day_type, focus, label)")
        .eq("id", programId)
        .maybeSingle();
      
      return { data, error };
    },
  };
}
