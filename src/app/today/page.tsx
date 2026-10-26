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
import { DayPlanPrompt } from "@/components/day-plan-prompt";
import type { Database } from "@/lib/database.types";
import { loadTodaySessionState, makeTodayLoaderDeps } from "@/lib/today/loader";
import { ensureProfileRows } from "@/lib/auth/ensure-profile";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { RefetchOnResume } from "./refetch-on-resume";
import { buildTodayRowsForProgram } from "@/lib/today/build-today-rows-for-program";
import { buildWeekDays } from "@/lib/today/compute-done-days";
import { getUnitsPreference } from "@/lib/units";
import { WeekList } from "./week-list";
import { previousDayResumeHref } from "@/lib/today/session-detection";
import { isMissedYesterday } from "@/lib/today/is-missed-yesterday";
import { loadEndedEarlySummary } from "@/lib/session/load-ended-early-summary";
import { StrengthDoneBanner } from "./strength-done-banner";
import { pickLatestCompletedStrength } from "@/lib/today/pick-latest-completed-strength";
import { buildChosenByDayIndex } from "@/lib/today/chosen-by-day";
import { shouldLoadPlannableDays } from "@/lib/today/should-load-plannable";
import { decideRestDayResume } from "@/lib/today/rest-day-resume";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TodayPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- wave 1 -------------------------------------------------------------
  // Nothing here depends on anything else here, so all three go at once. This
  // page used to await eight queries one after another; the two that remain
  // are the only genuine dependencies in the screen.
  const [profileRes, programRes, equipmentRes] = await Promise.all([
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

  // Load session state and ensure current block in parallel. The rollover
  // doesn't write sessions, so these are independent.
  const [sessionState, rollover] = await Promise.all([
    loadTodaySessionState(
      makeTodayLoaderDeps(supabase, { yesterday, weekAheadEnd }),
      localToday
    ),
    ensureCurrentBlock(
      supabase,
      user.id,
      localToday,
      programRes.data,
    ),
  ]);

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
  const daysRes = await supabase
    .from("program_days")
    // One string literal: Supabase infers the row type from it, and a
    // concatenation degrades the result to GenericStringError.
    .select("id, day_index, day_type, focus, label, program_day_exercises(order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, exercises(name, cue, movement_pattern, metric))")
    .eq("status", "active")
    .eq("program_id", program.id)
    .order("day_index")
    .order("order_index", { referencedTable: "program_day_exercises" });

  const days = daysRes.data;
  // Derived from the user's own local date rather than re-reading the clock,
  // so the weekday and the date can never disagree at a midnight boundary.
  const todayIndex = isoWeekday(localToday);
  const scheduled = days?.find((d) => d.day_index === todayIndex);

  // Session state already loaded before wave 2, with allSessions and todaySessions
  const { allSessions, todaySessions } = sessionState;

  const isStrength = (t: string | null) => t === "weights" || t === "bodyweight";

  /*
    Which of today's session rows speaks for the day.

    A "what about tomorrow?" choice made yesterday is a planned row for today,
    and it wins over the weekday template -- without that the choice would be
    written and then quietly ignored, which is worse than not offering it. But
    the state of that row is not the point. Whatever the user actually did today
    keeps the day's identity through every state it passes: planned, started,
    abandoned, finished.

    Reading only `planned` meant that starting a swapped day and leaving it
    part-way flipped Today back to the block's label while "Resume session"
    still resumed the swapped one -- the screen said Legs and the button gave
    you Pull. Adding `in_progress` fixed that case and left two more: a session
    ABANDONED (which is resumable now, so Start hands back a day the screen has
    stopped naming) and a session FINISHED (where the header reverted to the
    block's label above a list of the exercises that were actually done).

    Yoga and breathing are the exception in every state but `planned`: they are
    anytime activities and a six-minute breathing session does not rename the
    day.
  */
  const ownsToday = (s: (typeof todaySessions)[number]) =>
    s.actual_type !== null &&
    (s.status === "planned" ||
      (isStrength(s.actual_type) &&
        (s.status === "in_progress" || s.status === "completed" || s.status === "skipped")));

  // Finished beats under way beats intended beats abandoned. Only the last two
  // can genuinely coexist -- abandon a day, then choose something else for it.
  const OWNER_RANK: Record<string, number> = {
    completed: 0,
    in_progress: 1,
    planned: 2,
    skipped: 3,
  };
  /*
    Rank first, then newest. The tie is real: an account can carry several
    abandoned rows for one day -- anything written before a restart began
    reusing them does -- and `startSession` resumes the most recent of those.
    Deciding it differently here would put Today's label and the Start button
    back out of step, which is the bug this whole block exists to prevent.
  */
  const override = todaySessions
    .filter(ownsToday)
    .sort(
      (a, b) =>
        (OWNER_RANK[a.status] ?? 9) - (OWNER_RANK[b.status] ?? 9) ||
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    )[0];
  const overrideDay = override?.program_day_id
    ? days?.find((d) => d.id === override.program_day_id)
    : undefined;

  const today = overrideDay ?? scheduled;
  const dayType = override?.actual_type ?? scheduled?.day_type ?? null;
  const dayLabel = labelForDayType(dayType ?? "rest", today?.label ?? null);
  /*
    Only worth explaining when it actually differs from what the block said.

    This compared program-day ids alone, which is wrong in the one case where
    the id cannot be resolved: a rebuild replaces `program_days`, so every
    session from before it points at a day of the retired block. `overrideDay`
    is then undefined, the id comparison says "differs", and Today announced
    "You chose this for today, so it replaces the Legs your block had
    scheduled" -- on a Legs day, about a session nobody had chosen anything for.

    So the type is checked first, which is what a rest, yoga or breathing
    override changes, and the day ids only when the override's day is one this
    block still has. An unresolvable id says nothing either way, and the label
    on screen is the block's own in that case anyway.
  */
  const overrideDiffers =
    override !== undefined &&
    (override.actual_type !== (scheduled?.day_type ?? null) ||
      (overrideDay !== undefined && overrideDay.id !== (scheduled?.id ?? null)));
  const isTraining = dayType === "weights" || dayType === "bodyweight";

  const completedStrengthSession = pickLatestCompletedStrength(todaySessions);
  const strengthDone = completedStrengthSession !== undefined;
  // Resume detection: from loader (searches all sessions, not just today)
  const strengthOpen = sessionState.strengthOpen;

  /*
    The day's workout, once it is a thing that happened rather than a thing that
    was planned: started, or finished. Today used to list the block's template
    for the rest of the day regardless, so after a session in which an exercise
    was swapped, "Session complete. Well done." sat above the five exercises the
    day STARTED with -- including the one swapped away and never performed. The
    plan is what you intended; the screen should show what you did.

    A day merely planned through "what about tomorrow?" has no session exercises
    of its own yet, so it keeps the template.
  */
  const performed =
    override &&
    isStrength(override.actual_type) &&
    (override.status === "completed" || override.started_at !== null)
      ? override
      : undefined;

  /*
    Yesterday was a training day and nothing was completed on it. SPEC section 7
    asks the same question in that case, about today rather than tomorrow --
    the point being that a missed day should prompt a decision rather than
    quietly becoming a hole in the week.
  */
  const yesterdayIndex = isoWeekday(yesterday);
  const yesterdayDay = days?.find((d) => d.day_index === yesterdayIndex);
  const yesterdaySessions = allSessions.filter((s) => s.local_date === yesterday);
  const missedYesterday = isMissedYesterday({
    yesterday,
    programStartedOn: program.started_on,
    yesterdayIsTrainingDay:
      yesterdayDay?.day_type === "weights" || yesterdayDay?.day_type === "bodyweight",
    hadCompletedStrengthYesterday: yesterdaySessions.some(
      (s) => s.status === "completed" && isStrength(s.actual_type),
    ),
  });
  // Only worth asking while today is still open to being changed.
  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;

  // ---- wave 3 -------------------------------------------------------------
  // Both of these are conditional, and on most loads neither runs: the prompt
  // only on a day following a missed one, the session's own exercises only once
  // a workout has been started. Run together so the uncommon day that needs
  // both still costs one round trip.
  const [plannable, performedRows, endedEarlySummary, loggedSetsRes] = await Promise.all([
    shouldLoadPlannableDays({ askAboutToday, dayType, strengthOpen: strengthOpen !== undefined })
      ? plannableDays(supabase, program.id)
      : Promise.resolve([]),
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
    // Load ended-early summary for completed strength session
    completedStrengthSession
      ? loadEndedEarlySummary(supabase, completedStrengthSession.id)
      : Promise.resolve(null),
    // FIX (c): Load actual logged sets for completed sessions
    strengthDone && completedStrengthSession
      ? supabase
          .from("session_exercises")
          .select("order_index, metric, session_sets(reps, weight_kg, duration_seconds, is_warmup_set)")
          .eq("session_id", completedStrengthSession.id)
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
    // FIX (c): Add logged sets display for completed sessions
    loggedSets?: string | null;
  };

  const template = (isTraining ? (today?.program_day_exercises ?? []) : []) as Array<{
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
    status: Database["public"]["Enums"]["exercise_status"] | null;
    swapped_from_exercise_id: string | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
    exercises: {
      name: string;
      cue: string | null;
    } | null;
  }> | null;

  // Build today rows with deload computation
  const todayExercises: TodayRow[] = buildTodayRowsForProgram({
    actual,
    template,
    program: {
      started_on: program.started_on,
      week_offset: program.week_offset,
      deload_week: program.deload_week,
    },
    localToday,
    // "What you did": the sets actually logged, warm-ups excluded.
    logged: loggedSetsRes?.data
      ? { exercises: loggedSetsRes.data, units: getUnitsPreference(profile.units) }
      : null,
  });

  // Recompute week and isDeload for UI display (header, deload banner, etc.)
  const { cycleWeekFor } = await import("@/lib/program/block-range");
  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, localToday);
  const isDeload = week === program.deload_week;

  /*
    One-day overrides across this week, keyed by weekday so "Your week" can show
    them. Without this the list rendered the block's template labels only, so a
    choice made last night was invisible until the day arrived: the user picked
    Rest for tomorrow and the week still said Push. Only a difference is
    recorded -- "keep the plan" writes no row, and a swap that happens to match
    the template is not news.

    A swapped day keeps its identity after the session finishes: the header says
    "You chose this for today" throughout, so "Your week" must too. Completed
    strength sessions are included; yoga and breathing are not (they're anytime
    activities that don't own the day).
  */
  const chosenByDayIndex = buildChosenByDayIndex(allSessions, days ?? [], localToday, todayIndex);

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

      {sessionState.creditedBanner && (
        <p className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {sessionState.creditedBanner}
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

      {askAboutToday && (
        <DayPlanPrompt
          localDate={localToday}
          dayLabel="Today"
          plannedLabel={dayLabel}
          days={plannable}
          heading="You missed yesterday"
          intro={`${labelForDayType(
            yesterdayDay?.day_type ?? "rest",
            yesterdayDay?.label ?? null,
          )} did not happen.`}
        />
      )}

      {dayType === "rest" && (() => {
        const decision = decideRestDayResume({ dayType, strengthOpen, localToday });

        return (
          <>
            {/* Rest day with an open strength session shows Resume */}
            {decision.showResume && decision.resumeButton && (
              <div className="mt-7">
                {decision.resumeButton.type === "link" ? (
                  <Link
                    href={decision.resumeButton.href}
                    className="block w-full rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    Resume session
                  </Link>
                ) : (
                  <StartSessionButton label={decision.resumeButton.label} />
                )}
              </div>
            )}

            <p className="mt-6 text-muted">
              Rest is part of the training. Your body builds strength while recovering.
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-border bg-surface-2 p-5">
                <h3 className="font-semibold">Active recovery</h3>
                <p className="mt-1 text-sm text-muted">
                  Light movement helps recovery: a 20-minute walk, gentle yoga, or mobility work.
                </p>
                <div className="mt-4 flex gap-3">
                  <Link
                    href="/yoga"
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2"
                  >
                    Yoga
                  </Link>
                  <Link
                    href="/breathe"
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-surface-2"
                  >
                    Breathe
                  </Link>
                </div>
              </div>
              {/* Only show swap prompt when no strength session is open */}
              {decision.showSwap && (
                <DayPlanPrompt
                  localDate={localToday}
                  dayLabel="Today"
                  plannedLabel="Rest"
                  days={plannable}
                  heading="Or train today anyway"
                  intro="Pick what you'd like to do instead."
                />
              )}
            </div>
          </>
        );
      })()}

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
            <StrengthDoneBanner
              endedEarly={endedEarlySummary?.endedEarly ?? false}
              workingSets={endedEarlySummary?.workingSets ?? 0}
              plannedSets={endedEarlySummary?.plannedSets ?? 0}
            />
          ) : (() => {
            const resumeHref = previousDayResumeHref(strengthOpen, localToday);
            return resumeHref ? (
              <Link
                href={resumeHref}
                className="block w-full rounded-xl bg-accent px-6 py-5 text-center text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                Resume session
              </Link>
            ) : (
              /*
                "Resume" only once something has actually been started. A day
                planned through "what about tomorrow?" is a session row that was
                never begun, and calling that a resume told the user they had left
                a workout half-done when they had not.
              */
              <StartSessionButton
                label={strengthOpen?.started_at ? "Resume session" : "Start session"}
              />
            );
          })()}
        </div>
      )}

      {isTraining && (
        <section className="mt-7">
          {/*
            The heading said "15 min warm-up", which is what SPEC section 7 asks
            for and not what the session builds: five items totalling nine
            minutes, with no ramp-up-sets phase. Naming a duration the app does
            not deliver is worse than naming none.
          */}
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
            {!(actual && actual.length > 0)
              ? "Warm-up, then"
              : strengthDone
                ? "What you did"
                : /* Started and left: the list is real, but it is not finished. */
                  "Where you got to"}
          </h2>
          <ol className="space-y-2">
            {todayExercises.map((row) => (
              <li
                key={row.key}
                className="rounded-xl border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-semibold ${row.skipped ? "text-muted line-through" : ""}`}>
                    {row.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-accent">
                    {/* FIX (c): Show actual logged sets for completed sessions */}
                    {row.loggedSets ?? `${row.sets} × ${row.repsMin}–${row.repsMax}${row.metric === "seconds" ? "s" : ""}`}
                  </span>
                </div>
                {(row.swappedIn || row.skipped || (isDeload && isTraining && !row.skipped && !(actual && actual.length > 0))) && (
                  <p className="mt-1 text-xs font-medium text-muted uppercase tracking-wider">
                    {row.skipped ? "Skipped" : row.swappedIn ? "Swapped in" : "Deload"}
                  </p>
                )}
                {row.cue && <p className="mt-1 text-sm text-muted">{row.cue}</p>}
                <p className="mt-1 text-xs text-muted">{row.restSeconds}s rest</p>
              </li>
            ))}
          </ol>
          {!(actual && actual.length > 0) && (
            <p className="mt-4 text-center text-xs text-muted">
              Warm-up is built from today&apos;s muscles and any joint you flagged.
            </p>
          )}
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
        <WeekList
          days={buildWeekDays({ days: days ?? [], sessions: allSessions, localToday, todayIndex })}
          chosenByDayIndex={chosenByDayIndex}
        />
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
