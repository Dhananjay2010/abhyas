"use server";

import { revalidatePath } from "next/cache";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";

export type Result = { ok: true } | { ok: false; error: string };

/** Record a finished breathing session so it counts in history and streaks. */
export async function completeBreathingSession(input: {
  patternId: string;
  durationSeconds: number;
}): Promise<Result> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const today = localDateString(profile?.timezone || "Asia/Kolkata");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("local_date", today)
    .maybeSingle();

  const payload = {
    status: "completed" as const,
    actual_type: "meditation" as const,
    completed_at: new Date().toISOString(),
    duration_seconds: Math.max(1, Math.round(input.durationSeconds)),
    breathing_pattern_id: input.patternId,
  };

  // A breathing session should never overwrite a finished workout; on a day
  // that already has one, it is recorded separately.
  const { error } =
    session && session.status !== "completed"
      ? await supabase.from("sessions").update(payload).eq("id", session.id)
      : await supabase.from("sessions").insert({
          user_id: user.id,
          local_date: today,
          planned_type: "meditation",
          ...payload,
        });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
