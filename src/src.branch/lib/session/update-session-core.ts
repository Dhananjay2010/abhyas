import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateSessionClient = Pick<SupabaseClient<Database>, "from">;

export async function updateSessionCore(
  client: UpdateSessionClient,
  sessionId: string,
  userId: string,
  localDate: string,
  payload: Partial<Database["public"]["Tables"]["sessions"]["Update"]>,
): Promise<
  | { ok: true; sessionId: string }
  | { ok: false; error: string }
> {
  const { error } = await client.from("sessions").update(payload).eq("id", sessionId);

  // Handle 23505: another in_progress session already exists for this user/date
  if (error && error.code === "23505") {
    // Re-read the existing in_progress session for this user/date
    const { data: currentInProgress } = await client
      .from("sessions")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentInProgress) {
      return { ok: true, sessionId: currentInProgress.id };
    }
    // Re-read failed, fall through to error
    return { ok: false, error: "Could not start the session" };
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, sessionId };
}
