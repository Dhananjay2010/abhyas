type QB = {
  select(c: string): QB;
  eq(c: string, v: unknown): QB;
  maybeSingle(): PromiseLike<{
    data: { local_date: string } | null;
    error: { message: string } | null;
  }>;
};

export type SessionLookupClient = { from(t: "sessions"): QB };

export function makeFetchSessionLocalDate(supabase: SessionLookupClient) {
  return async (sessionId: string, userId: string) => {
    const { data, error } = await supabase
      .from("sessions")
      .select("local_date")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    return { localDate: data?.local_date ?? null, error: error?.message ?? null };
  };
}
