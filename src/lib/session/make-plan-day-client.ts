/**
 * Factory to create PlanDayClient adapter from Supabase client.
 * Extracted for testing without full server action context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { queryActiveProgramDay } from "@/lib/session/query-active-program-day";
import { loadPlanDay, createSupabaseDeps } from "@/lib/session/load-plan-day";
import type { PlanDayClient } from "@/lib/session/plan-day-core";
import type { Database } from "@/lib/database.types";

type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

type SessionRow = {
  id: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  program_day_id?: string | null;
};

// Minimal structural interface for Supabase client methods used by this adapter.
// Real SupabaseClient<Database> satisfies this at call sites via narrowing cast.
export type PlanDayDb = Pick<SupabaseClient<Database>, "from">;

export function makePlanDayClient(
  supabase: PlanDayDb,
  userId: string
): PlanDayClient {
  return {
    async findDaySessions(localDate: string) {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, status, actual_type, program_day_id")
        .eq("user_id", userId)
        .eq("local_date", localDate);
      return { rows: data ?? [], error: error?.message ?? null };
    },
    async findActiveProgram() {
      const { data, error } = await supabase
        .from("programs")
        .select("id, started_on, deload_week, week_offset")
        .eq("user_id", userId)
        .maybeSingle();
      return { program: data, error: error?.message ?? null };
    },
    async loadProgramDay(programDayId: string) {
      const result = await loadPlanDay(
        createSupabaseDeps(supabase as SupabaseClient<Database>),
        programDayId,
      );
      return result;
    },
    async findProgramDay(programId: string, dayIndex: number) {
      return queryActiveProgramDay(supabase as SupabaseClient<Database>, userId, programId, dayIndex);
    },
    async updateSession(id: string, row: SessionInsert) {
      const { error } = await supabase
        .from("sessions")
        .update(row)
        .eq("id", id);
      return { error: error?.message ?? null };
    },
    async deleteSessions(ids: string[]) {
      const { error } = await supabase.from("sessions").delete().in("id", ids).eq("user_id", userId);
      return { error: error?.message ?? null };
    },
    async insertSession(row: SessionInsert) {
      const { error } = await supabase.from("sessions").insert(row);
      if (error?.code === "23505") {
        return { error: null };
      }
      return { error: error?.message ?? null };
    },
    async rereadDaySessions(localDate: string) {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, status, actual_type, program_day_id")
        .eq("local_date", localDate)
        .eq("user_id", userId);
      return { rows: data ?? [], error: error?.message ?? null };
    },
  };
}
