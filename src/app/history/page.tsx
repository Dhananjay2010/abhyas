import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";
import { localDateString } from "@/lib/dates";
import { SessionRow, type SessionSummary } from "@/components/session-row";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const today = localDateString(profile.timezone || "Asia/Kolkata");

  const [sessionsRes, volumeRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, local_date, status, actual_type, duration_seconds, is_deload, week_in_block, program_days(label)")
      .order("local_date", { ascending: false })
      .limit(60),
    supabase.from("session_volume").select("session_id, volume_kg, set_count"),
  ]);

  const sessions = sessionsRes.data ?? [];
  const volumeById = new Map(
    (volumeRes.data ?? []).map((v) => [v.session_id, v]),
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">History</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        {sessions.length === 0
          ? "Nothing here yet."
          : `Your last ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}.`}
      </p>

      {sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
          Finish a session and it will appear here, with every set you logged.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const vol = volumeById.get(s.id);
            const summary: SessionSummary = {
              id: s.id,
              localDate: s.local_date,
              label:
                (s.program_days as unknown as { label: string } | null)?.label ??
                s.actual_type ??
                "Session",
              status: s.status,
              isDeload: s.is_deload,
              durationSeconds: s.duration_seconds,
              setCount: vol?.set_count ?? 0,
              volumeKg: Number(vol?.volume_kg ?? 0),
            };
            return (
              <li key={s.id}>
                <SessionRow s={summary} today={today} />
              </li>
            );
          })}
        </ul>
      )}

      <BottomNav active="/history" />
    </main>
  );
}
