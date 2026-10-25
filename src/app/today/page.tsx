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
import { closeStaleSessions } from "@/lib/session/close-stale";
import { ensureProfileRows } from "@/lib/auth/ensure-profile";
import { cycleWeekFor } from "@/lib/program/block-range";
import { resolveTimezoneWithProfile } from "@/lib/timezone";
import { countWorkingSets, getCompletionDisplay } from "@/lib/today/row-helpers";
import { sessionSummaryTitle } from "@/lib/session/end-early-text";
import { RefetchOnResume } from "./refetch-on-resume";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TodayPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  // ---- wave 1 -------------------------------------------------------------
  // Nothing here depends on anything else here, so all three go at once. This
  // page used to await eight queries one after another; the two that remain
  // are the only genuine dependencies in the screen.
  const [profileRes, programRes, equipmentRes, openRes] = await Promise.all([
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
      .select("id, status, actual_type, local_date, program_day_id, started_at, created_at")
      .gte("local_date", yesterday)
      .lte("local_date", weekAheadEnd)
      // Newest first, which is how `startSession` breaks the same tie.
      .order("created_at", { ascending: false }),
  ]);

  const days = daysRes.data;
  // Derived from the user's own local date rather than re-reading the clock,
  // so the weekday and the date can never disagree at a midnight boundary.
  const todayIndex = isoWeekday(localToday);
  const scheduled = days?.find((d) => d.day_index === todayIndex);

  const allSessions = sessionsRes.data ?? [];
  const todaySessions = allSessions.filter((s) => s.local_date === localToday);

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
  const week = cycleWeekFor({ started_on: program.started_on, week_offset: program.week_offset }, localToday);
  const isDeload = week === program.deload_week;
  const isTraining = dayType === "weights" || dayType === "bodyweight";

  const strengthDone = todaySessions.some(
    (s) => s.status === "completed" && isStrength(s.actual_type),
  );
  const strengthOpen = todaySessions.find(
    (s) => (s.status === "in_progress" || s.status === "planned") && isStrength(s.actual_type),
  );

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
  const missedYesterday =
    (yesterdayDay?.day_type === "weights" || yesterdayDay?.day_type === "bodyweight") &&
    !yesterdaySessions.some((s) => s.status === "completed" && isStrength(s.actual_type));
  // Only worth asking while today is still open to being changed.
  const askAboutToday = missedYesterday && !strengthDone && !strengthOpen;

  // ---- wave 3 -------------------------------------------------------------
  // Both of these are conditional, and on most loads neither runs: the prompt
  // only on a day following a missed one, the session's own exercises only once
  // a workout has been started. Run together so the uncommon day that needs
  // both still costs one round trip.
  const [plannable, performedRows] = await Promise.all([
    askAboutToday ? plannableDays(supabase, program.id) : Promise.resolve([]),
    performed
      ? supabase
          .from("session_exercises")
          // `metric` from the session row, not from `exercises`: it records the
          // unit the session was RUN in. Reading the catalogue's current metric
          // rendered a plank prescribed in reps last week as "2 x 8-12s".
          .select("order_index, planned_sets, planned_reps_min, planned_reps_max, rest_seconds, status, swapped_from_exercise_id, metric, exercises!session_exercises_exercise_id_fkey(name, cue), session_sets!session_sets_session_exercise_id_fkey(is_warmup_set)")
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
    completionLabel: string;
    strikethrough: boolean;
    swappedIn: boolean;
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
    status: string | null;
    swapped_from_exercise_id: string | null;
    metric: Database["public"]["Enums"]["exercise_metric"] | null;
    exercises: {
      name: string;
      cue: string | null;
    } | null;
    session_sets: Array<{
      is_warmup_set: boolean;
    }>;
  }> | null;

  const todayExercises: TodayRow[] =
    actual && actual.length > 0
      ? actual.map((r) => {
          const workingSetsLogged = countWorkingSets(r.session_sets ?? []);
          const plannedSets = r.planned_sets ?? 0;

          const sessionStatus = performed?.status;
          const effectiveStatus =
            sessionStatus === "completed" || sessionStatus === "skipped"
              ? sessionStatus
              : "in_progress";

          const isSwappedIn = r.swapped_from_exercise_id !== null;
          const { label: completionLabel, strikethrough } = getCompletionDisplay(
            effectiveStatus,
            workingSetsLogged,
            plannedSets,
            isSwappedIn,
          );

          return {
            key: `s${r.order_index}`,
            name: r.exercises?.name ?? "",
            cue: r.exercises?.cue ?? null,
            metric: r.metric ?? null,
            sets: r.planned_sets,
            repsMin: r.planned_reps_min,
            repsMax: r.planned_reps_max,
            restSeconds: r.rest_seconds,
            completionLabel,
            strikethrough,
            swappedIn: isSwappedIn,
          };
        })
      : template.map((r) => ({
          key: `p${r.order_index}`,
          name: r.exercises?.name ?? "",
          cue: r.exercises?.cue ?? null,
          metric: r.exercises?.metric ?? null,
          sets: r.target_sets,
          repsMin: r.target_reps_min,
          repsMax: r.target_reps_max,
          restSeconds: r.rest_seconds,
          completionLabel: "",
          strikethrough: false,
          swappedIn: false,
        }));

  // Determine if the completed session was ended early (has pending exercises)
  const endedEarly = performed && performed.status === "completed" && actual
    ? actual.some((ex) => ex.status === "pending")
    : false;

  /*
    One-day overrides across this week, keyed by weekday so "Your week" can show
    them. Without this the list rendered the block's template labels only, so a
    choice made last night was invisible until the day arrived: the user picked
    Rest for tomorrow and the week still said Push. Only a difference is
    recorded -- "keep the plan" writes no row, and a swap that happens to match
    the template is not news.
  */
  const chosenByDayIndex = new Map<number, string>();
  for (const d of days ?? []) {
    // The next time this weekday comes round, which is today for today.
    const date = addDays(localToday, (d.day_index - todayIndex + 7) % 7);
    const sess = allSessions.find(
      (x) =>
        x.local_date === date &&
        (x.status === "planned" || x.status === "in_progress") &&
        x.actual_type !== null,
    );
    if (!sess?.actual_type) continue;
    const chosenDay = sess.program_day_id
      ? days?.find((pd) => pd.id === sess.program_day_id)
      : undefined;
    const label = labelForDayType(sess.actual_type, chosenDay?.label ?? null);
    if (label !== d.label) chosenByDayIndex.set(d.day_index, label);
  }

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

      {dayType === "rest" && (
        <>
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
            <DayPlanPrompt
              localDate={localToday}
              dayLabel="Today"
              plannedLabel="Rest"
              days={plannable}
              heading="Or train today anyway"
              intro="Pick what you'd like to do instead."
            />
          </div>
        </>
      )}

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
              {sessionSummaryTitle(endedEarly)}
            </p>
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
          )}
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
                  <span className={`font-semibold ${row.strikethrough ? "text-muted line-through" : ""}`}>
                    {row.name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-accent">
                    {row.sets} × {row.repsMin}–{row.repsMax}
                    {row.metric === "seconds" ? "s" : ""}
                  </span>
                </div>
                {row.completionLabel && (
                  <p className="mt-1 text-xs font-medium text-muted uppercase tracking-wider">
                    {row.completionLabel}
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
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {(days ?? []).map((d) => {
            const chosen = chosenByDayIndex.get(d.day_index);
            return (
              <li
                key={d.day_index}
                className={`flex justify-between gap-4 px-4 py-3 ${
                  d.day_index === todayIndex ? "bg-surface-2" : ""
                }`}
              >
                <span className={d.day_index === todayIndex ? "font-semibold" : "text-muted"}>
                  {DAY_NAMES[d.day_index - 1]}
                </span>
                {chosen ? (
                  <span className="text-right">
                    <span className="font-medium text-accent">{chosen}</span>
                    <span className="block text-xs text-muted">your choice</span>
                  </span>
                ) : (
                  <span className={d.day_type === "rest" ? "text-muted" : "font-medium"}>
                    {d.label}
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
