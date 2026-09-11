import { notFound, redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import {
  PATTERN_COLUMNS,
  PREFS_COLUMNS,
  patternFromRow,
  prefsFromRow,
} from "@/lib/breathing/pattern";
import { PracticeSetup } from "./practice-setup";

export const dynamic = "force-dynamic";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const [patternRes, settingsRes, lastRes, countRes] = await Promise.all([
    supabase.from("breathing_patterns").select(PATTERN_COLUMNS).eq("slug", slug).maybeSingle(),
    supabase.from("user_settings").select(PREFS_COLUMNS).eq("user_id", user.id).maybeSingle(),
    // Filtered through the pattern's slug, so it need not wait for the
    // pattern's id to arrive first.
    supabase
      .from("breathing_logs")
      .select("planned_cycles, breathing_patterns!inner(slug)")
      .eq("breathing_patterns.slug", slug)
      .order("created_at", { ascending: false })
      .limit(1),
    // Whether this person has ever finished a practice: the safety note is
    // shown before the first one.
    supabase.from("breathing_logs").select("id", { count: "exact", head: true }),
  ]);

  const pattern = patternRes.data ? patternFromRow(patternRes.data) : null;
  if (!pattern) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <PracticeSetup
        pattern={pattern}
        prefs={prefsFromRow(settingsRes.data)}
        lastCycles={lastRes.data?.[0]?.planned_cycles ?? null}
        firstPractice={(countRes.count ?? 0) === 0}
      />
    </main>
  );
}
