import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { GOALS, LEVELS, ageOn } from "@/lib/onboarding/options";
import { BuildPlanButton } from "./build-plan-button";
import { StartSessionButton } from "./start-session-button";
import { SignOutForm } from "./signout-form";
import Link from "next/link";
import { ensureCurrentBlock } from "@/lib/program/rollover";
import { addDays, isoWeekday, localDateString } from "@/lib/dates";
import { labelForDayType, plannableDays } from "@/lib/program/day-plan";
import type { Database } from "@/lib/database.types";
import { closeStaleSessions } from "@/lib/session/close-stale";
import { ensureProfileRows } from "@/lib/auth/ensure-profile";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { TodayPrompts } from "@/components/today/today-prompts";
import { WarmupSection } from "@/components/today/warmup-section";
import { buildPage } from "@/lib/today/build-page";
import { RefetchOnResume } from "./refetch-on-resume";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TodayPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- wave 1 -------------------------------------------------------------
  // Nothing here depends on anything else here, so all these go at once. This
  // page used to await eight queries one after another; the two that remain
  // are the only genuine dependencies in the screen.
  const [profileRes, programRes, equipmentRes, openRes, hasStartedAnyRes] = await Promise.all([
    // `maybeSingle`, not `single`: a missing row is a state to handle, not an
    // exception. With `single` PostgREST answers "Cannot coerce the result to a
    // single JSON object", which threw during the server render and reached the
    // user as a blank page reading "Minified React error #441".
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("programs")
      .select("id, block_number, split_type, started_on, ends_on, deload_week, week_offset")
      .eq("status", "active")
      .maybeSingle(),
    // A strength plan with no equipment recorded is a misconfiguration that
    // produces a thin, odd-looking plan. Say so rather than letting the user
    // wonder why their Pull day is full of core work.
    supabase.from("user_equipment").select("*", { count: "exact", head: true }),
    // Sessions still open from an earlier day. Fetched without a date filter
    // because the local date is not known until the profile arrives.
    supabase
      .from("sessions")
      .select("id, local_date")
      .in("status", ["planned", "in_progress"])
      .order("local_date", { ascending: false })
      .limit(20),
    // All sessions for checking if user has started any strength or yoga session
    supabase
      .from("sessions")
      .select("actual_type, started_at")
      .not("started_at", "is", null)
      .in("actual_type", ["weights", "bodyweight", "yoga"])
      .limit(1),
  ]);

  /*
    A signed-in user with no profile row. This should be impossible -- the
    signup trigger creates it -- and for three days it was the norm, because
    that trigger was lost when the database moved region. Rather than throw,
    create the row and carry on: the user is signed in, we know who they are,
    and the next thing that happens is onboarding asking them everything anyway.
  */
  let profile = profileRes.data;
  if (!profile) {
    await ensureProfileRows(supabase, user);
    const { data: healed } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    profile = healed;
  }
  if (!profile) {
    // Still nothing: the insert was refused. Say so on the screen rather than
    // throwing, because a server render that throws shows a blank page in
    // production and the person who can see it has no way to tell us what it
    // said.
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">We could not set up your account</h1>
        <p className="mt-3 text-muted">
          You are signed in, but your profile could not be created. This is our
          problem, not yours.
        </p>
        <div className="mt-8">
          <SignOutForm label="Sign out and try again" />
        </div>
      </main>
    );
  }
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  const timezone = resolveTimezoneWithProfile(profile.timezone);
  const firstName = profile.display_name?.split(" ")[0] ?? "";
  const localToday = localDateString(timezone);

  // A session left open on an earlier day is closed out here. Without this, a
  // workout that was trained but never walked through the summary counted for
  // nothing at all — see lib/session/close-stale.ts. No-op on a normal day.
  const credited = await closeStaleSessions(supabase, openRes.data ?? [], localToday);

  // A four-week block that has run its course rolls over here, on load. Handing
  // it the block we just read makes the common case — the block is current —
  // free: it compares two dates and returns, with no query of its own.
  const rollover = await ensureCurrentBlock(
    supabase,
    user.id,
    localToday,
    programRes.data,
  );

  /*
    The days "Your week" can be about, plus yesterday.

    Deliberately the seven days STARTING today rather than Monday to Sunday of
    the calendar week. "Your week" is a weekday template, and mapping it onto
    the calendar week meant that on a Sunday every row was a day that had
    already happened and tomorrow -- the one day a choice had just been made
    about -- fell outside the window entirely. Each weekday row now means its
    next occurrence, which is today for today.
  */
  const yesterday = addDays(localToday, -1);
  const weekAheadEnd = addDays(localToday, 6);

  // A rollover replaced the active block, so the row read above is stale.
  // This happens on one day in twenty-eight. Query for the new block by its
  // exact ID rather than by status, so there's no ambiguity or timing issue.
  let program = programRes.data;
  if (rollover.status === "rolled_over") {
    const { data: fresh } = await supabase
      .from("programs")
      .select("id, block_number, split_type, started_on, ends_on, deload_week, week_offset")
      .eq("id", rollover.programId)
      .single();
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
          <BuildPlanButton label="Build my first block" confirm={false} />
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
      .select("id, day_index, day_type, focus, label, program_day_exercises(order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern, metric))")
      .eq("status", "active")
      .eq("program_id", program.id)
      .order("day_index")
      .order("order_index", { referencedTable: "program_day_exercises" }),
    // Judged per training type, not "most recent session of any kind". A
    // one-minute breathing session used to be the newest row and made Today
    // announce "Session complete", hiding the Start button and locking the user
    // out of their actual workout for the rest of the day.
    // Yesterday comes along for the ride, because SPEC section 7 asks the same
    // "what about tomorrow?" question about today when yesterday was a training
    // day nobody finished. One extra date in an `in` filter is free; a second
    // query would not be.
    /*
      Yesterday through to a week today. One range filter rather than a list of
      dates, and the same single round trip either way.

      The week ahead is needed because "Your week" used to render the block's
      template labels only, so a choice made last night about today or tomorrow
      was invisible there: the user picked Rest for tomorrow and the week still
      said Push.
    */
    supabase
      .from("sessions")
      .select("id, status, actual_type, local_date, program_id, program_day_id, started_at, created_at")
      .gte("local_date", yesterday)
      .lte("local_date", weekAheadEnd)
      // Newest first, which is how `startSession` breaks the same tie.
      .order("created_at", { ascending: false }),
  ]);

  const days = daysRes.data;

  // Fetch session_exercises for yesterday (needed for missed-day detection)
  const allSessions = sessionsRes.data ?? [];
  const yesterdaySessions = allSessions.filter((s) => s.local_date === yesterday);
  const yesterdaySessionIds = yesterdaySessions.map((s) => s.id);
  
  const sessionExercisesRes = yesterdaySessionIds.length > 0
    ? await supabase
        .from("session_exercises")
        .select("session_id, session_sets(is_warmup_set, reps, duration_seconds)")
        .in("session_id", yesterdaySessionIds)
    : { data: null, error: null };

  // Build all Today page state using buildPage helper
  const pageResult = buildPage({
    profile: {
      id: profile.id,
      created_at: profile.created_at,
      timezone: profile.timezone,
    },
    program: {
      id: program.id,
      started_on: program.started_on,
      week_offset: program.week_offset,
      deload_week: program.deload_week,
    },
    days: days ?? [],
    allSessionsRes: hasStartedAnyRes,
    todaySessionsRes: sessionsRes,
    yesterdaySessionsRes: sessionsRes,
    sessionExercisesRes,
    timezone,
    localToday,
    yesterday,
  });

  const {
    todayView,
    todayState,
    promptBlocks,
    trainAnywayDays,
    yesterdayDay,
    scheduled,
    today,
    dayType,
    dayLabel,
    overrideDiffers,
    strengthDone,
    strengthOpen,
    performed,
    needsPlannableDays,
  } = pageResult;

  const { week, isDeload, weekRowsWithChoices } = todayView;
  const { isTraining, nextTrainingDay: nextTraining } = todayState;
  const firstTrainingDay = todayView.firstTrainingDay;

  // For display purposes only (not derivation)
  const todayIndex = isoWeekday(localToday);

  // ---- wave 3 -------------------------------------------------------------
  // Load plannable days when the DayPlanPrompt can render (rest day or missed-yesterday).
  // The prompt offers "Swap the day", which needs the strength/bodyweight options.
  // The session's own exercises are loaded only when a workout has been started.

  const [plannable, performedRows] = await Promise.all([
    needsPlannableDays ? plannableDays(supabase, program.id) : Promise.resolve([]),
    performed
      ? supabase
          .from("session_exercises")
          // `metric` from the session row, not from `exercises`: it records the
          // unit the session was RUN in. Reading the catalogue's current metric
          // rendered a plank prescribed in reps last week as "2 x 8-12s".
          .select("order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, swapped_from_exercise_id, metric, exercises!session_exercises_exercise_id_fkey(name, cue)")
          .eq("session_id", performed.id)
          .order("order_index")
      : Promise.resolve(null),
  ]);

  /*
    One shape for the list, whichever source it came from, so the markup below
    does not have to know. An override to rest, yoga or breathing has no program
    day, so the block's own exercises for this weekday must not leak through
    underneath it.
  */
  type TodayRow = {
    key: string;
    name: string;
    cue: string | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
    sets: number | null;
    repsMin: number | null;
    repsMax: number | null;
    restSeconds: number | null;
    skipped: boolean;
    swappedIn: boolean;
  };

  const todayDay = days?.find((d) => d.id === today?.id);
  const template = (todayState.isTraining ? (todayDay?.program_day_exercises ?? []) : []) as Array<{
    order_index: number;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
    rest_seconds: number | null;
    exercises: {
      name: string;
      cue: string | null;
      metric: Database["public"]["Enums"]["exercise_metric"] | null;
    } | null;
  }>;

  const actual = (performedRows?.data ?? null) as Array<{
    order_index: number;
    planned_sets: number | null;
    planned_reps_min: number | null;
    planned_reps_max: number | null;
    rest_seconds: number | null;
    status: string | null;
    swapped_from_exercise_id: string | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
    exercises: {
      name: string;
      cue: string | null;
    } | null;
  }> | null;

  const todayExercises: TodayRow[] =
    actual && actual.length > 0
      ? actual.map((r) => ({
          key: `s${r.order_index}`,
          name: r.exercises?.name ?? "",
          cue: r.exercises?.cue ?? null,
          metric: r.metric ?? null,
          sets: r.planned_sets,
          repsMin: r.planned_reps_min,
          repsMax: r.planned_reps_max,
          restSeconds: r.rest_seconds,
          skipped: r.status === "skipped",
          swappedIn: r.swapped_from_exercise_id !== null,
        }))
      : template.map((r) => ({
          key: `p${r.order_index}`,
          name: r.exercises?.name ?? "",
          cue: r.exercises?.cue ?? null,
          metric: r.exercises?.metric ?? null,
          sets: r.target_sets,
          repsMin: r.target_reps_min,
          repsMax: r.target_reps_max,
          restSeconds: r.rest_seconds,
          skipped: false,
          swappedIn: false,
        }));

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-36">
      <RefetchOnResume />
      <header>
        <p className="text-sm text-muted">
          {DAY_NAMES[todayIndex - 1]} · Block {program.block_number} · Week {week} of 4
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {dayType === "rest" ? "Rest day" : dayLabel}
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

      {credited > 0 && (
        <p className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {credited === 1
            ? "A session you had left open has been counted — you had logged sets in it."
            : `${credited} sessions you had left open have been counted — you had logged sets in them.`}
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

      {overrideDiffers && (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          You chose this for today, so it replaces the{" "}
          {labelForDayType(scheduled?.day_type ?? "rest", scheduled?.label ?? null)} your
          block had scheduled. The rest of the week is unchanged.
        </p>
      )}

      <TodayPrompts
        promptBlocks={promptBlocks}
        localToday={localToday}
        dayLabel={dayLabel}
        plannable={plannable}
        trainAnywayDays={trainAnywayDays}
        yesterdayDay={yesterdayDay ? { day_type: yesterdayDay.day_type, label: yesterdayDay.label } : null}
        nextTraining={nextTraining}
        isTraining={isTraining}
        firstTrainingDay={firstTrainingDay}
      />

      {dayType === "meditation" && (
        <div className="mt-6">
          <p className="text-muted">A breathing day. Pick a practice and sit with it.</p>
          <Link
            href="/breathe"
            className="mt-5 block rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Start breathing
          </Link>
        </div>
      )}

      {dayType === "yoga" && (
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
            <StartSessionButton label={strengthOpen?.started_at ? "Resume session" : "Start session"} />
          )}
        </div>
      )}

      {isTraining && <WarmupSection todayExercises={todayExercises} actual={actual} strengthDone={strengthDone} />}

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
          {weekRowsWithChoices.map((row) => {
            return (
              <li
                key={row.dayIndex}
                className={`flex justify-between gap-4 px-4 py-3 ${
                  row.dayIndex === todayIndex ? "bg-surface-2" : ""
                }`}
              >
                <span className={row.dayIndex === todayIndex ? "font-semibold" : "text-muted"}>
                  {DAY_NAMES[row.dayIndex - 1]}
                </span>
                {row.isChoice ? (
                  <span className="text-right">
                    <span className="font-medium text-accent">{row.label}</span>
                    <span className="block text-xs text-muted">your choice</span>
                  </span>
                ) : (
                  <span className={days?.find(d => d.day_index === row.dayIndex)?.day_type === "rest" ? "text-muted" : "font-medium"}>
                    {row.label}
                  </span>
                )}
              </li>
            );
          })}
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
        <SignOutForm label="Sign out" />
      </div>

    </main>
  );
}
