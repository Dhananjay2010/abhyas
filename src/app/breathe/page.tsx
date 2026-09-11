import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import {
  INTENTS,
  PATTERN_COLUMNS,
  PREFS_COLUMNS,
  patternFromRow,
  prefsFromRow,
  type Intent,
  type Pattern,
} from "@/lib/breathing/pattern";
import { breathingStats } from "@/lib/breathing/stats";
import { BreatheHome, type LastPractice } from "./breathe-home";

export const dynamic = "force-dynamic";

export default async function BreathePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");
  const search = await searchParams;

  // Only a lower bound, so it does not need the user's timezone and nothing
  // has to wait for the profile. A year is more than any streak worth showing.
  const since = addDays(localDateString("UTC"), -370);

  const [patternsRes, settingsRes, profileRes, practicesRes, logsRes] = await Promise.all([
    supabase.from("breathing_patterns").select(PATTERN_COLUMNS).order("sort_order"),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", user.id).single(),
    // Sessions rather than logs: practices recorded before breathing_logs
    // existed still count towards the week and the streak.
    supabase
      .from("sessions")
      .select("local_date, duration_seconds")
      .eq("actual_type", "meditation")
      .eq("status", "completed")
      .gte("local_date", since)
      .limit(2000),
    supabase
      .from("breathing_logs")
      .select("pattern_id, planned_cycles")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (patternsRes.error) {
    throw new Error(`Could not load the breathing practices: ${patternsRes.error.message}`);
  }

  const patterns = (patternsRes.data ?? [])
    .map((row) => patternFromRow(row))
    .filter((p): p is Pattern => p !== null);
  const today = localDateString(profileRes.data?.timezone || "Asia/Kolkata");
  const stats = breathingStats(
    (practicesRes.data ?? []).map((s) => ({
      localDate: s.local_date,
      seconds: s.duration_seconds ?? 0,
    })),
    today,
  );

  // Newest first, so the first log seen for a pattern is its latest length.
  const lastCyclesByPattern: Record<string, number> = {};
  for (const log of logsRes.data ?? []) {
    if (log.pattern_id && !(log.pattern_id in lastCyclesByPattern)) {
      lastCyclesByPattern[log.pattern_id] = log.planned_cycles;
    }
  }
  const latest = logsRes.data?.[0];
  const last: LastPractice | null = latest?.pattern_id
    ? { patternId: latest.pattern_id, cycles: latest.planned_cycles }
    : null;

  const asked = typeof search.intent === "string" ? search.intent : null;
  const intent = INTENTS.some((i) => i.value === asked) ? (asked as Intent) : null;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <BreatheHome
        patterns={patterns}
        prefs={prefsFromRow(settingsRes.data)}
        stats={stats}
        lastCyclesByPattern={lastCyclesByPattern}
        last={last}
        intent={intent}
        todayIndex={isoWeekday(today)}
      />
    </main>
  );
}
