import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GOALS, LEVELS, SPLIT_BY_DAYS, ageOn } from "@/lib/onboarding/options";

export const dynamic = "force-dynamic";

const TRACK_LABELS: Record<string, string> = {
  weights: "Gym — weights",
  bodyweight: "Bodyweight at home",
  yoga: "Yoga",
  meditation: "Breathing and meditation",
};

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [profileRes, weightRes, injuriesRes, equipmentRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("body_metrics")
      .select("weight_kg")
      .order("recorded_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("user_injuries").select("body_region, severity"),
    supabase.from("user_equipment").select("equipment_id"),
  ]);

  const profile = profileRes.data;
  if (!profile) throw new Error(profileRes.error?.message ?? "Profile not found");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const weightKg = weightRes.data?.weight_kg ?? null;
  const age = profile.date_of_birth ? ageOn(profile.date_of_birth) : null;
  const bmi =
    weightKg && profile.height_cm
      ? weightKg / (Number(profile.height_cm) / 100) ** 2
      : null;

  const trainingDays = (profile.days_per_week ?? 0) - (profile.yoga_days_per_week ?? 0);
  const injuries = injuriesRes.data ?? [];
  const equipmentCount = equipmentRes.data?.length ?? 0;

  const rows: [string, string][] = [
    ["Goal", GOALS.find((g) => g.value === profile.goal)?.label ?? "—"],
    ["Level", LEVELS.find((l) => l.value === profile.level)?.label ?? "—"],
    ["Track", TRACK_LABELS[profile.primary_track ?? ""] ?? "—"],
    [
      "Week",
      profile.yoga_days_per_week
        ? `${trainingDays} training + ${profile.yoga_days_per_week} yoga`
        : `${profile.days_per_week} days`,
    ],
    ["Split", SPLIT_BY_DAYS[profile.days_per_week ?? 0] ?? "—"],
    ["Age", age !== null ? `${age}` : "—"],
    ["BMI", bmi ? bmi.toFixed(1) : "—"],
    [
      "Equipment",
      profile.has_all_equipment ? "Everything" : `${equipmentCount} selected`,
    ],
    [
      "Injuries",
      injuries.length === 0
        ? "None"
        : injuries.map((i) => i.body_region.replace("_", " ")).join(", "),
    ],
  ];

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Hello{profile.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 text-muted">Your profile is set. Here is what we will build on.</p>

      <dl className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-5 py-3.5">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {bmi && bmi >= 30 && (
        <p className="mt-4 rounded-xl border border-border bg-surface-2 px-5 py-4 text-sm text-muted">
          Your plan will leave out jumping and other high-impact work, and favour
          supported and machine variations. You can override this in Settings later.
        </p>
      )}

      <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-6 text-center">
        <p className="text-sm text-muted">
          Next: the exercise catalogue and your first four-week block.
        </p>
      </div>

      <form action="/auth/signout" method="post" className="mt-8">
        <button className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg">
          Sign out
        </button>
      </form>
    </main>
  );
}
