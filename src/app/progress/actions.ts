"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";
import { checkActionRateLimit } from "@/lib/rate-limit/server-action";

export type LogWeightResult = { ok: true } | { ok: false; error: string };

export async function logBodyWeight(weightKg: number): Promise<LogWeightResult> {
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
    return { ok: false, error: "Weight should be between 25 and 300 kg." };
  }

  const rateLimit = await checkActionRateLimit("default");
  if (rateLimit) return rateLimit;
  
  const { supabase, user } = await getAuthedClient();
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
