import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";
import { BreathingRunner, type Pattern } from "./breathing-runner";

export const dynamic = "force-dynamic";

export default async function BreathePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [patternsRes, settingsRes] = await Promise.all([
    supabase.from("breathing_patterns").select("*").order("sort_order"),
    supabase
      .from("user_settings")
      .select("meditation_default_minutes")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const patterns: Pattern[] = (patternsRes.data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    inhale: Number(p.inhale_seconds),
    holdIn: Number(p.hold_in_seconds),
    exhale: Number(p.exhale_seconds),
    holdOut: Number(p.hold_out_seconds),
    defaultCycles: p.default_cycles,
    benefit: p.benefit,
    contraindications: p.contraindications,
  }));

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Breathe</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Pick a pattern. The circle grows as you breathe in and shrinks as you breathe
        out, so you can follow it without counting.
      </p>

      <BreathingRunner
        patterns={patterns}
        defaultMinutes={settingsRes.data?.meditation_default_minutes ?? 10}
      />

      <BottomNav active="/today" />
    </main>
  );
}
