import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { GOALS, LEVELS, ageOn } from "@/lib/onboarding/options";
import { BuildPlanButton } from "./build-plan-button";
import { StartSessionButton } from "./start-session-button";
import Link from "next/link";
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
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- wave 1 -------------------------------------------------------------
  // Nothing here depends on anything else here, so all three go at once. This
  // page used to await eight queries one after another; the two that remain
  // are the only genuine dependencies in the screen.
  const [profileRes, programRes, equipmentRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("programs")
      .select("id, block_number, split_type, started_on, ends_on, deload_week")
      .eq("status", "active")
      .maybeSingle(),
    // A strength plan with no equipment recorded is a misconfiguration that
    // produces a thin, odd-looking plan. Say so rather than letting the user
    // wonder why their Pull day is full of core work.
    supabase.from("user_equipment").select("*", { count: "exact", head: true }),
  ]);

  const profile = profileRes.data;
  if (!profile) throw new Error(profileRes.error?.message ?? "Profile not found");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = profile.timezone || "Asia/Kolkata";
  const firstName = profile.display_name?.split(" ")[0] ?? "";
  const localToday = localDateString(timezone);

  // A four-week block that has run its course rolls over here, on load. Handing
  // it the block we just read makes the common case — the block is current —
  // free: it compares two dates and returns, with no query of its own.
  const rollover = await ensureCurrentBlock(
    supabase,
    user.id,
    localToday,
    programRes.data,
  );

  // A rollover replaced the active block, so the row read above is stale.
  // This happens on one day in twenty-eight.
  let program = programRes.data;
  if (rollover.status === "rolled_over") {
    const { data: fresh } = await supabase
      .from("programs")
      .select("id, block_number, split_type, started_on, ends_on, deload_week")
      .eq("status", "active")
      .maybeSingle();
    program = fresh;
  }

  const needsEquipment =
    (profile.primary_track === "weights" || profile.primary_track === "bodyweight") &&
    !profile.has_all_equipment &&
    (equipmentRes.count ?? 0) === 0;

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
      </main>
    );
  }

  // ---- wave 2 -------------------------------------------------------------
  // The week's days arrive with each day's exercises embedded. That is one
  // round trip instead of two, and it removes the dependency that forced the
  // exercise query to wait for the day query to name today's row.
  const [daysRes, sessionsRes] = await Promise.all([
    supabase
      .from("program_days")
      // One string literal: Supabase infers the row type from it, and a
      // concatenation degrades the result to GenericStringError.
      .select("id, day_index, day_type, focus, label, program_day_exercises(order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern))")
      .eq("program_id", program.id)
      .order("day_index")
      .order("order_index", { referencedTable: "program_day_exercises" }),
    // Judged per training type, not "most recent session of any kind". A
    // one-minute breathing session used to be the newest row and made Today
    // announce "Session complete", hiding the Start button and locking the user
    // out of their actual workout for the rest of the day.
    supabase
      .from("sessions")
      .select("id, status, actual_type")
      .eq("local_date", localToday),
  ]);

  const days = daysRes.data;
  const todayIndex = localWeekday(timezone);
  const today = days?.find((d) => d.day_index === todayIndex);
  const week = weekInBlock(program.started_on, timezone);
  const isDeload = week === program.deload_week;
  const isTraining = today?.day_type === "weights" || today?.day_type === "bodyweight";

  const todayExercises = (today?.program_day_exercises ?? []) as Array<{
    order_index: number;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
    rest_seconds: number | null;
    exercises: { name: string; cue: string | null } | null;
  }>;

  const todaySessions = sessionsRes.data;
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
            {todayExercises.map((row) => {
              const ex = row.exercises;
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

      {/*
        Always reachable, whatever today is. These previously appeared only on
        rest and yoga days, so on a training day there was no way to open either
        without typing the URL.
      */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
          Anytime
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/yoga"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-medium transition-colors hover:border-accent"
          >
            Yoga
          </Link>
          <Link
            href="/breathe"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-medium transition-colors hover:border-accent"
          >
            Breathing
          </Link>
        </div>
      </section>

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

    </main>
  );
}
