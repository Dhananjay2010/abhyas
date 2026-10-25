import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StartSessionClient = Pick<SupabaseClient<Database>, "from">;

export async function startSessionCore(
  client: StartSessionClient,
  userId: string,
  payload: Database["public"]["Tables"]["sessions"]["Insert"],
): Promise<
  | { ok: true; sessionId: string }
  | { ok: false; error: string }
> {
  const { data: session, error } = await client.from("sessions").insert(payload).select("id").single();

  // Handle 23505: unique_violation from the partial unique index
  if (error && error.code === "23505") {
    // The partial unique index rejected a duplicate. Re-read and return the existing session,
    // filtering by the same local_date this start is for. A stale tab from yesterday must not
    // be put into yesterday's in_progress session.
    const { data: rereadSession } = await client
      .from("sessions")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("local_date", payload.local_date)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rereadSession) {
      return { ok: true, sessionId: rereadSession.id };
    }
    // Re-read failed (no session for this date), so the 23505 was from a different date.
    // Return a clear error rather than letting it fall through to the generic message.
    return { ok: false, error: "Another session is already in progress for a different day" };
  }

  if (error || !session) {
    return { ok: false, error: error?.message ?? "Could not start the session" };
  }

  return { ok: true, sessionId: session.id };
}
