import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { getCachedEquipment } from "@/lib/supabase/cached-queries";
import { SettingsForm, type SettingsState } from "./settings-form";
import { getSiteInfo } from "@/lib/legal/site-info";
import { SignOutButton } from "./signout-button";
import { buildTimezoneOptions } from "@/lib/timezone-options";
import { isPlanStale, type GenerationInputsSnapshot } from "./plan-staleness";
import { weekInBlock } from "@/lib/program/prescription";
import { localDateString } from "@/lib/dates";
import { resolveTimezoneWithProfile } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const [profileRes, settingsRes, equipment, userEquipmentRes, injuriesRes, activeBlockRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      getCachedEquipment(),
      supabase.from("user_equipment").select("equipment_id"),
      supabase.from("user_injuries").select("body_region, severity"),
      supabase
        .from("programs")
        .select("generation_inputs, days_per_week, started_on")
        .eq("status", "active")
        .maybeSingle(),
    ]);

  const profile = profileRes.data;
  if (!profile) redirect("/");
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  const st = settingsRes.data;
  const activeBlock = activeBlockRes.data;

  // Compute plan staleness on the server
  const equipmentIds = (userEquipmentRes.data ?? []).map((r) => r.equipment_id);
  const currentInjuryRegions = (injuriesRes.data ?? [])
    .filter((i) => i.severity === "current")
    .map((i) => i.body_region);

  const staleness = isPlanStale(
    {
      goal: profile.goal,
      level: profile.level,
      primary_track: profile.primary_track,
      days_per_week: profile.days_per_week,
      yoga_days_per_week: profile.yoga_days_per_week ?? 0,
      preferred_session_minutes: profile.preferred_session_minutes ?? 60,
      has_all_equipment: profile.has_all_equipment ?? false,
      equipment_ids: equipmentIds,
      current_injury_regions: currentInjuryRegions,
    },
    activeBlock
      ? {
          generation_inputs: activeBlock.generation_inputs as GenerationInputsSnapshot | null,
          days_per_week: activeBlock.days_per_week,
        }
      : null,
  );

  // Current week for the rebuild confirmation text
  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const currentWeek = activeBlock?.started_on
    ? weekInBlock(activeBlock.started_on, localDateString(timezone))
    : null;

  const initial: SettingsState = {
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week ?? 0,
    preferredSessionMinutes: profile.preferred_session_minutes ?? 60,
    hasAllEquipment: profile.has_all_equipment ?? false,
    equipmentIds: (userEquipmentRes.data ?? []).map((r) => r.equipment_id),
    injuries: (injuriesRes.data ?? []).map((r) => ({
      bodyRegion: r.body_region,
      severity: r.severity,
    })),
    planningMode: st?.planning_mode ?? "progression",
    perSetLogging: st?.per_set_logging ?? true,
    resumeSession: st?.resume_session ?? true,
    cooldownEnabled: st?.cooldown_enabled ?? true,
    restAutostart: st?.rest_timer_autostart ?? true,
    restSound: st?.rest_timer_sound ?? true,
    restVibrate: st?.rest_timer_vibrate ?? true,
    restOverrideSeconds: st?.rest_seconds_override ?? null,
    bodyweightPrompt: st?.bodyweight_prompt ?? "weekly",
    timezone: profile.timezone,
  };

  // F1: Build timezone list with canonical aliases (FALLBACK_TIMEZONE, Europe/Kyiv, UTC, etc.)
  // Always includes the user's stored timezone.
  const timezones = buildTimezoneOptions(profile.timezone);

  const { supportEmail } = getSiteInfo();

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Signed in as {user.email}. Changes save as you make them.
      </p>

      <SettingsForm 
        initial={initial} 
        equipment={equipment} 
        timezones={timezones}
        initialPlanStale={staleness.stale}
        currentWeek={currentWeek}
      />

      <div className="mt-12 space-y-8 border-t border-border pt-8">
        <section>
          <h2 className="text-lg font-semibold mb-2">Legal & Support</h2>
          <div className="space-y-3">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              Privacy Policy →
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              Terms of Service →
            </a>
            <a
              href={`mailto:${supportEmail}`}
              className="block rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              Contact Support →
            </a>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Account</h2>
          <div className="space-y-3">
            <SignOutButton />
            <a
              href="/settings/delete-account"
              className="block rounded-xl border border-danger/30 bg-danger/10 px-6 py-3 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
            >
              Delete account →
            </a>
          </div>
        </section>
      </div>

    </main>
  );
}
