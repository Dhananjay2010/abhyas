"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/dates";

export type LogWeightResult = { ok: true } | { ok: false; error: string };

export async function logBodyWeight(weightKg: number): Promise<LogWeightResult> {
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
    return { ok: false, error: "Weight should be between 25 and 300 kg." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  // One weigh-in per local day; logging again replaces it.
  const { error } = await supabase.from("body_metrics").upsert(
    {
      user_id: user.id,
      recorded_on: localDateString(profile?.timezone || "Asia/Kolkata"),
      weight_kg: weightKg,
    },
    { onConflict: "user_id,recorded_on" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}
