import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type LoadStartProgramClient = Pick<SupabaseClient<Database>, "from">;

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

export type LoadStartProgramResult =
  | { ok: true; program: ProgramWithDays; dayId: string }
  | { ok: false; error: string };

export async function loadStartProgram(
  client: LoadStartProgramClient,
  programId: string,
  dayIndex: number,
): Promise<LoadStartProgramResult> {
  const { data: program } = await client
    .from("programs")
    .select("id, started_on, deload_week, week_offset, program_days!inner(id, day_index, day_type, focus, label)")
    .eq("program_days.status", "active")
    .eq("id", programId)
    .maybeSingle();

  if (!program) {
    return { ok: false, error: "No plan for today." };
  }

  const typedProgram = program as unknown as ProgramWithDays;
  const day = typedProgram.program_days.find((d) => d.day_index === dayIndex);

  if (!day) {
    return { ok: false, error: "No plan for today." };
  }

  return { ok: true, program: typedProgram, dayId: day.id };
}
