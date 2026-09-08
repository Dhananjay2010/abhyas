import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow, type InitialState } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [profileRes, weightRes, equipmentRes, userEquipmentRes, injuriesRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("body_metrics")
        .select("weight_kg")
        .order("recorded_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("equipment").select("id, name, category").order("sort_order"),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
    ]);

  const profile = profileRes.data;
  if (!profile) {
    throw new Error(
      profileRes.error?.message ??
        "Your profile row is missing. Sign out and back in to recreate it.",
    );
  }

  if (profile.onboarding_completed_at) redirect("/today");

  const initial: InitialState = {
    displayName: profile.display_name,
    dateOfBirth: profile.date_of_birth,
    sex: profile.sex,
    heightCm: profile.height_cm,
    weightKg: weightRes.data?.weight_kg ?? null,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week ?? 0,
    disclaimerAccepted: Boolean(profile.disclaimer_accepted_at),
    hasAllEquipment: profile.has_all_equipment ?? false,
    equipmentIds: (userEquipmentRes.data ?? []).map((r) => r.equipment_id),
    injuries: (injuriesRes.data ?? []).map((r) => ({
      bodyRegion: r.body_region,
      severity: r.severity,
    })),
  };

  return <OnboardingFlow initial={initial} equipment={equipmentRes.data ?? []} />;
}
