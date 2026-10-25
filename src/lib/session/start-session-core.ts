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
    // The partial unique index rejected a duplicate. Re-read and return the existing session.
    const { data: rereadSession } = await client
      .from("sessions")
      .select("id, created_at, local_date")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rereadSession) {
      if (rereadSession.local_date !== payload.local_date) {
        return { 
          ok: false, 
          error: "You have an open session from a different day. Please finish or abandon it before starting a new one." 
        };
      }
      return { ok: true, sessionId: rereadSession.id };
    }
    // Re-read failed, fall through to generic error
  }

  if (error || !session) {
    return { ok: false, error: error?.message ?? "Could not start the session" };
  }

  return { ok: true, sessionId: session.id };
}
