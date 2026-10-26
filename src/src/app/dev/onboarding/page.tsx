import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingPreview } from "./preview";

/**
 * Development-only harness for the onboarding wizard.
 *
 * It renders the real flow with stubbed persistence so the screens can be
 * reviewed without a Google session. It proves layout and interaction only --
 * the server actions and RLS are NOT exercised here.
 */
export const dynamic = "force-dynamic";

export default async function DevOnboardingPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  // Real equipment rows where possible. The harness has no session, and the
  // equipment policy is `select to authenticated`, so this usually comes back
  // empty -- fall back to a representative sample so the step stays reviewable.
  const supabase = await createClient();
  const { data } = await supabase.from("equipment").select("id, name, category").order("sort_order");

  const equipment =
    data && data.length > 0
      ? data
      : [
          { id: "bodyweight", name: "Bodyweight (no equipment)", category: "bodyweight" },
          { id: "pull_up_bar", name: "Pull-up bar", category: "bodyweight" },
          { id: "barbell", name: "Barbell", category: "free_weight" },
          { id: "dumbbell", name: "Dumbbells", category: "free_weight" },
          { id: "kettlebell", name: "Kettlebell", category: "free_weight" },
          { id: "squat_rack", name: "Squat rack / power cage", category: "machine" },
          { id: "leg_press", name: "Leg press", category: "machine" },
          { id: "cable_machine", name: "Cable machine", category: "cable" },
          { id: "resistance_band", name: "Resistance bands", category: "accessory" },
          { id: "jump_rope", name: "Jump rope", category: "accessory" },
        ];

  return <OnboardingPreview equipment={equipment} />;
}
