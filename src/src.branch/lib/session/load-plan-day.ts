import type { Database } from "../database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanDay = {
  id: string;
  day_type: Database["public"]["Enums"]["day_type"];
};

export type LoadPlanDayDeps = {
  fetchDay: (dayId: string) => Promise<{ data: PlanDay | null; error: { message: string } | null }>;
};

export type LoadPlanDayResult =
  | { ok: true; day: PlanDay }
  | { ok: false; error: string };

export async function loadPlanDay(
  deps: LoadPlanDayDeps,
  dayId: string,
): Promise<LoadPlanDayResult> {
  const { data: day, error } = await deps.fetchDay(dayId);

  if (error) {
    return { ok: false, error: "Could not load the training block." };
  }

  if (!day) {
    return { ok: false, error: "That day is not in your block." };
  }

  return { ok: true, day };
}

export function createSupabaseDeps(client: SupabaseClient<Database>): LoadPlanDayDeps {
  return {
    async fetchDay(dayId: string) {
      const { data, error } = await client
        .from("program_days")
        .select("id, day_type")
        .eq("id", dayId)
        .eq("status", "active")
        .maybeSingle();
      
      return { data, error };
    },
  };
}
