import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type LoadPlanDayClient = Pick<SupabaseClient<Database>, "from">;

export type PlanDay = {
  id: string;
  day_type: Database["public"]["Enums"]["day_type"];
};

export type LoadPlanDayResult =
  | { ok: true; day: PlanDay }
  | { ok: false; error: string };

export async function loadPlanDay(
  client: LoadPlanDayClient,
  dayId: string,
): Promise<LoadPlanDayResult> {
  const { data: day } = await client
    .from("program_days")
    .select("id, day_type")
    .eq("id", dayId)
    .eq("status", "active")
    .maybeSingle();

  if (!day) {
    return { ok: false, error: "That day is not in your block." };
  }

  return { ok: true, day };
}
