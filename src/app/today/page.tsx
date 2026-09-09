import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GOALS, LEVELS, ageOn } from "@/lib/onboarding/options";
import { BuildPlanButton } from "./build-plan-button";
import { StartSessionButton } from "./start-session-button";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { localDateString } from "@/lib/dates";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** ISO weekday (1 = Monday) for "now" in the user's own timezone. */
function localWeekday(timezone: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long" })
    .format(new Date());
  const i = DAY_NAMES.indexOf(name);
  return i === -1 ? 1 : i + 1;
}

function weekInBlock(startedOn: string, timezone: string): number {
  const today = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()),
  );
  const start = new Date(`${startedOn}T00:00:00`);
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) throw new Error(profileError?.message ?? "Profile not found");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = profile.timezone || "Asia/Kolkata";
  const firstName = profile.display_name?.split(" ")[0] ?? "";

  // A four-week block that has run its course rolls over here, on load. This is
  // a no-op while the block is current, so it is safe on every request.
  const rollover = await ensureCurrentBlock(
    supabase,
    user.id,
    localDateString(timezone),
  );

  const { data: program } = await supabase
    .from("programs")
    .select("id, block_number, split_type, started_on, ends_on, deload_week")
    .eq("status", "active")
    .maybeSingle();

  if (!program) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Hello{firstName && `, ${firstName}`}</h1>
        <p className="mt-3 text-muted">
          Your profile is set but you have no training block yet. Building one takes a
          second and uses your goal, level, equipment and injuries.
        </p>
        <div className="mt-8">
          <BuildPlanButton label="Build my first block" />
        </div>
        <BottomNav active="/today" />
      </main>
    );
  }

  const { data: days } = await supabase
    .from("program_days")
    .select("id, day_index, day_type, focus, label")
    .eq("program_id", program.id)
    .order("day_index");

  const todayIndex = localWeekday(timezone);
  const today = days?.find((d) => d.day_index === todayIndex);
  const week = weekInBlock(program.started_on, timezone);
  const isDeload = week === program.deload_week;

  const { data: todayExercises } = today
    ? await supabase
        .from("program_day_exercises")
        .select("order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern)")
        .eq("program_day_id", today.id)
        .order("order_index")
    : { data: null };

  const isTraining = today?.day_type === "weights" || today?.day_type === "bodyweight";

  // A strength plan with no equipment recorded is a misconfiguration that
  // produces a thin, odd-looking plan. Say so rather than letting the user
  // wonder why their Pull day is full of core work.
  const { count: equipmentCount } = await supabase
    .from("user_equipment")
    .select("*", { count: "exact", head: true });
  const needsEquipment =
    (profile.primary_track === "weights" || profile.primary_track === "bodyweight") &&
    !profile.has_all_equipment &&
    (equipmentCount ?? 0) === 0;

  const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  // Judged per training type, not "most recent session of any kind". A
  // one-minute breathing session used to be the newest row and made Today
  // announce "Session complete", hiding the Start button and locking the user
  // out of their actual workout for the rest of the day.
  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("id, status, actual_type")
    .eq("local_date", localToday);

  const isStrength = (t: string | null) => t === "weights" || t === "bodyweight";
  const strengthDone = (todaySessions ?? []).some(
    (s) => s.status === "completed" && isStrength(s.actual_type),
  );
  const strengthOpen = (todaySessions ?? []).find(
    (s) => (s.status === "in_progress" || s.status === "planned") && isStrength(s.actual_type),
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <header>
        <p className="text-sm text-muted">
          {DAY_NAMES[todayIndex - 1]} · Block {program.block_number} · Week {week} of 4
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {today?.day_type === "rest"
            ? "Rest day"
            : today?.day_type === "yoga"
              ? "Yoga"
              : (today?.label ?? "Today")}
        </h1>
        {isDeload && isTraining && (
          <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            Deload week. Lighter loads, nothing near failure — this is what lets week 5
            go up.
          </p>
        )}
      </header>

      {needsEquipment && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          You have no equipment listed, so your plan is limited to what needs
          none. Add your equipment in{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>{" "}
          and rebuild the block.
        </p>
      )}

      {rollover.status === "rolled_over" && (
        <p className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Block {rollover.blockNumber} starts today. Your main lifts carried over
          with their weights; the accessory work has been refreshed.
        </p>
      )}
      {rollover.status === "error" && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          Your block ended but the next one could not be built: {rollover.error}
        </p>
      )}

      {today?.day_type === "rest" && (
        <>
          <p className="mt-6 text-muted">
            Nothing scheduled. Rest properly, or do something light.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link
              href="/breathe"
              className="rounded-xl border border-border bg-surface px-4 py-4 text-center text-sm font-medium transition-colors hover:border-accent"
            >
              Breathing
            </Link>
            <Link
              href="/yoga"
              className="rounded-xl border border-border bg-surface px-4 py-4 text-center text-sm font-medium transition-colors hover:border-accent"
            >
              Yoga
            </Link>
          </div>
        </>
      )}

      {today?.day_type === "yoga" && (
        <div className="mt-6">
          <p className="text-muted">
            A yoga day. Pick up your series where you left off.
          </p>
          <Link
            href="/yoga"
            className="mt-5 block rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Start yoga
          </Link>
          <Link
            href="/breathe"
            className="mt-3 block rounded-xl border border-border bg-surface-2 px-6 py-3 text-center text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            Breathing instead
          </Link>
        </div>
      )}

      {isTraining && (
        <div className="mt-7">
          {strengthDone ? (
            <p className="rounded-xl border border-success/30 bg-success/10 px-5 py-4 text-center text-sm text-success">
              Session complete. Well done.
            </p>
          ) : (
            <StartSessionButton
              label={strengthOpen ? "Resume session" : "Start session"}
            />
          )}
        </div>
      )}

      {isTraining && (
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
            15 min warm-up, then
          </h2>
          <ol className="space-y-2">
            {(todayExercises ?? []).map((row) => {
              const ex = row.exercises as unknown as { name: string; cue: string | null };
              return (
                <li
                  key={row.order_index}
                  className="rounded-xl border border-border bg-surface px-4 py-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{ex?.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-accent">
                      {row.target_sets} × {row.target_reps_min}–{row.target_reps_max}
                    </span>
                  </div>
                  {ex?.cue && <p className="mt-1 text-sm text-muted">{ex.cue}</p>}
                  <p className="mt-1 text-xs text-muted">{row.rest_seconds}s rest</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-center text-xs text-muted">
            Warm-up is built from today&apos;s muscles and any joint you flagged.
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
          Your week
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {(days ?? []).map((d) => (
            <li
              key={d.day_index}
              className={`flex justify-between gap-4 px-4 py-3 ${
                d.day_index === todayIndex ? "bg-surface-2" : ""
              }`}
            >
              <span className={d.day_index === todayIndex ? "font-semibold" : "text-muted"}>
                {DAY_NAMES[d.day_index - 1]}
              </span>
              <span className={d.day_type === "rest" ? "text-muted" : "font-medium"}>
                {d.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-3 text-sm">
        <div className="flex justify-between gap-4 text-muted">
          <span>Goal</span>
          <span className="text-fg">
            {GOALS.find((g) => g.value === profile.goal)?.label ?? "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-muted">
          <span>Level</span>
          <span className="text-fg">
            {LEVELS.find((l) => l.value === profile.level)?.label ?? "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-muted">
          <span>Age</span>
          <span className="text-fg">
            {profile.date_of_birth ? ageOn(profile.date_of_birth) : "—"}
          </span>
        </div>
      </section>

      <div className="mt-10 space-y-3">
        <BuildPlanButton label="Rebuild this block" />
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg">
            Sign out
          </button>
        </form>
      </div>

      <BottomNav active="/today" />
    </main>
  );
}
