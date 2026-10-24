import type { Database } from "../database.types";

export type PlanDay = {
  id: string;
  day_type: Database["public"]["Enums"]["day_type"];
};

export type LoadPlanDayDeps = {
  fetchDay: (dayId: string) => Promise<PlanDay | null>;
};

export type LoadPlanDayResult =
  | { ok: true; day: PlanDay }
  | { ok: false; error: string };

export async function loadPlanDay(
  deps: LoadPlanDayDeps,
  dayId: string,
): Promise<LoadPlanDayResult> {
  const day = await deps.fetchDay(dayId);

  if (!day) {
    return { ok: false, error: "That day is not in your block." };
  }

  return { ok: true, day };
}

export function createSupabaseDeps(client: { from: (table: string) => any }): LoadPlanDayDeps {
  return {
    async fetchDay(dayId: string) {
      const { data } = await client
        .from("program_days")
        .select("id, day_type")
        .eq("id", dayId)
        .eq("status", "active")
        .maybeSingle();
      
      return data as PlanDay | null;
    },
  };
}
