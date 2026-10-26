"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nextSetTarget } from "@/lib/session/resume-state";
import type { Database } from "@/lib/database.types";
import type { WarmupItem } from "@/lib/program/warmup";
import {
  formatClock,
  useBeeper,
  useElapsed,
  useWakeLock,
  vibrate,
  useVibrationSupported,
} from "@/lib/session/device";
import { useRestPersistence } from "@/lib/session/rest-timer-persistence";
import { validateSet } from "@/lib/session/validation";
import { DayPlanPrompt } from "@/components/day-plan-prompt";
import type { NextDayPlan } from "@/lib/program/day-plan";
import { runnerErrorMessage } from "@/lib/session/runner-error-message";
import { formatTargetRange } from "@/lib/session/format-target-range";
import { applySwapResult } from "@/lib/session/apply-swap";
import { applySwapTarget } from "@/lib/session/apply-swap-target";
import {
  abandonSession,
  deleteSet,
  finishExercise,
  finishSession,
  findAlternatives,
  logSet,
  markWarmupDone,
  planDay,
  refreshAfterSession,
  swapExercise,
  type Alternative,
  type SwapResult,
} from "../actions";
import { SessionExpiredPrompt } from "@/components/session-expired-prompt";
import {
  createPendingSetController,
  type PendingSetState,
} from "@/lib/session/pending-set-controller";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";
import { isFinishDisabled, getFinishButtonText } from "@/lib/session/finish-guard";
import { getPendingUiMode, getReplayErrorMessage } from "@/lib/session/pending-ui-state";
import { registerFocusRetry } from "@/lib/session/focus-retry";
import { shouldShowCooldownForPending, isEndEarlyDisabled } from "@/lib/session/session-finish-decisions";
import { resolveSetConflict, type ConflictResult } from "@/lib/session/conflict-reducer";
import { useResumeRefresh } from "@/lib/session/use-resume-refresh";
import { createConcurrentGuard } from "@/lib/session/guard-concurrent";
import { RunnerStatusArea } from "@/components/runner-status-area";
import { selectRunnerStatusProps } from "@/lib/session/runner-status-selector";
import { exercisesReducer } from "@/lib/session/exercises-reducer";
import { pickCurrentExerciseIndex } from "@/lib/session/resume-state";

/** Injected so the runner can be exercised without a signed-in session. */
export type SessionActions = {
  markWarmupDone: typeof markWarmupDone;
  logSet: typeof logSet;
  deleteSet: typeof deleteSet;
  finishExercise: typeof finishExercise;
  finishSession: typeof finishSession;
  abandonSession: typeof abandonSession;
  findAlternatives: typeof findAlternatives;
  swapExercise: typeof swapExercise;
  refreshAfterSession: typeof refreshAfterSession;
  planDay: typeof planDay;
  getSessionSummary: typeof getSessionSummary;
};

import { getSessionSummary, type SummaryNote } from "../actions";
import { formatVolumeLifted } from "@/lib/session/format-volume-lifted";
import type { UnitsPreference } from "@/lib/units";

const REAL_ACTIONS: SessionActions = {
  markWarmupDone,
  logSet,
  deleteSet,
  finishExercise,
  finishSession,
  abandonSession,
  findAlternatives,
  swapExercise,
  refreshAfterSession,
  planDay,
  getSessionSummary,
};

type Feel = Database["public"]["Enums"]["set_feel"];
type Muscle = Database["public"]["Enums"]["muscle"];

export type LoggedSet = {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  /** Seconds held, for an exercise whose metric is `seconds`. */
  durationSeconds: number | null;
};

export type RunnerExercise = {
  id: string;
  exerciseId: string;
  name: string;
  cue: string | null;
  /** `seconds` turns the set entry into a hold: a countdown, not a rep count. */
  metric: Database["public"]["Enums"]["exercise_metric"];
  primaryMuscles: Muscle[];
  plannedSets: number;
  plannedRepsMin: number;
  plannedRepsMax: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  workingWeightKg: number | null;
  suggestedWeightKg: number | null;
  status: Database["public"]["Enums"]["exercise_status"];
  feel: Feel | null;
  sets: LoggedSet[];
  /** No external load: used for UI labeling of weight input. */
  isBodyweight: boolean;
  /** completed_at of the latest working set, so a resume lands on this exercise. */
  lastLoggedAt?: string | null;
};

export type RunnerSettings = {
  perSetLogging: boolean;
  restAutostart: boolean;
  restSound: boolean;
  restVibrate: boolean;
  restOverrideSeconds: number | null;
  cooldownEnabled: boolean;
};

type Phase = "warmup" | "work" | "cooldown" | "done";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "right", label: "Just right" },
  { value: "hard", label: "Hard" },
];

export type RunnerTimer = {
  setTimeout: (callback: () => void, ms: number) => number | NodeJS.Timeout;
  clearTimeout: (id: number | NodeJS.Timeout) => void;
};

const REAL_TIMER: RunnerTimer = {
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (id: number | NodeJS.Timeout) => clearTimeout(id),
};


export function SessionRunner({
  sessionId,
  sessionStatus,
  userId,
  isDeload,
  week,
  warmupAlreadyDone,
  startedAt,
  warmup,
  cooldown,
  exercises: initialExercises,
  settings,
  tomorrow,
  units = "metric",
  actions = REAL_ACTIONS,
  onExit,
  addEventListener: addEventListenerProp,
  removeEventListener: removeEventListenerProp,
  timer = REAL_TIMER,
  now = Date.now,
}: {
  sessionId: string;
  sessionStatus: Database["public"]["Enums"]["session_status"];
  userId: string;
  isDeload: boolean;
  week: number;
  warmupAlreadyDone: boolean;
  startedAt: string | null;
  warmup: WarmupItem[];
  cooldown: WarmupItem[];
  exercises: RunnerExercise[];
  settings: RunnerSettings;
  /** What tomorrow is, so the summary can ask about it. Null with no block. */
  tomorrow?: NextDayPlan | null;
  /** The user's display units, for the summary's total volume. */
  units?: UnitsPreference;
  actions?: SessionActions;
  onExit?: () => void;
  addEventListener?: (type: string, handler: () => void) => void;
  removeEventListener?: (type: string, handler: () => void) => void;
  timer?: RunnerTimer;
  now?: () => number;
  
}) {
  // Stable event listener functions for focus retry
  const addEventListener = useCallback((type: string, handler: () => void) => {
    if (addEventListenerProp) {
      addEventListenerProp(type, handler);
    } else if (type === "focus") {
      window.addEventListener(type, handler);
    } else {
      document.addEventListener(type, handler);
    }
  }, [addEventListenerProp]);
  
  const removeEventListener = useCallback((type: string, handler: () => void) => {
    if (removeEventListenerProp) {
      removeEventListenerProp(type, handler);
    } else if (type === "focus") {
      window.removeEventListener(type, handler);
    } else {
      document.removeEventListener(type, handler);
    }
  }, [removeEventListenerProp]);
  const router = useRouter();
  const elapsed = useElapsed(startedAt);
  const beeper = useBeeper(settings.restSound);
  
  // Use reducer to manage exercises with server data merging
  const [exercises, dispatch] = useReducer(
    exercisesReducer,
    initialExercises
  );
  
  // Functional updates go through the reducer so they apply to the state at
  // dispatch time (which may already include a resume merge), not to the
  // `exercises` this render closed over.
  const setExercises = useCallback((update: typeof initialExercises | ((prev: typeof initialExercises) => typeof initialExercises)) => {
    dispatch(
      typeof update === "function"
        ? { type: "update", update }
        : { type: "set", exercises: update },
    );
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [alternativesForExerciseId, setAlternativesForExerciseId] = useState<string | null>(null);
  // FIX (a): Load summary from DB on phase transition, not client state
  const [progressNotes, setProgressNotes] = useState<SummaryNote[]>([]);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [bannerFor, setBannerFor] = useState<number | null>(null);
  const [bannerContent, setBannerContent] = useState<{ name: string; message: string } | null>(null);
  // "What changed for next time": exactly the banner messages finishExercise
  // returned during THIS mount, one per exercise in finishing order. Never
  // rebuilt from the database (M-1): after a remount the section is absent.
  const [changeNotes, setChangeNotes] = useState<Array<{ id: string; name: string; message: string }>>([]);

  // Pending set controller for retry functionality (PR #113)
  const [pendingSetState, setPendingSetState] = useState<PendingSetState>({
    pending: [],
    expired: false,
    retrying: false,
    error: null,
    replayed: [],
    conflicts: 0,
  });

  const [controller] = useState(() => {
    if (typeof window === "undefined") return null;
    return createPendingSetController({
      storage: window.localStorage,
      logSet: actions.logSet,
      sessionId,
      sessionStatus,
      userId,
      onChange: setPendingSetState,
      deps: createPendingSetDeps(now),
      timer,
      addEventListener: addEventListenerProp,
      removeEventListener: removeEventListenerProp,
    });
  });

  useEffect(() => {
    if (controller) {
      controller.load();
    }
  }, [controller]);
  
  useEffect(() => {
    return () => {
      if (controller) {
        controller.cleanup();
      }
    };
  }, [controller]);

  // Auto-retry on mount, focus, and visibility change
  useEffect(() => {
    if (!controller) return;

    return registerFocusRetry(
      addEventListener,
      removeEventListener,
      () => controller.onFocus()
    );
  }, [controller, addEventListener, removeEventListener]);

  const [loadingAlternatives, setLoadingAlternatives] = useState(false);

  /*
    Every exercise already finished, and the session still open.

    That happens when someone finishes their last lift and then leaves before
    walking through the cool-down -- the session stays `in_progress` with
    nothing pending in it. Resuming used to drop them back on exercise ONE with
    its sets already logged and `allSetsDone` true, so the screen offered "How
    did that feel?" for a lift they had finished an hour earlier. Tapping it ran
    `finishExercise` a second time and applied progression twice: a double
    weight increment for work done once.

    So a session with nothing left to do resumes at its end, which is one tap
    from being properly completed. The cool-down screen is used even when the
    setting is off, because both of its buttons call `finishSession` and showing
    an unwanted screen once is a far smaller wrong than inflating a weight.
  */
  const nothingPending =
    exercises.length > 0 && !exercises.some((e) => e.status === "pending");

  const [phase, setPhase] = useState<Phase>(
    nothingPending ? "cooldown" : warmupAlreadyDone || warmup.length === 0 ? "work" : "warmup",
  );
  
  // Load summary when phase transitions to done (including on remount)
  // A failed load (ok:false or a network drop) shows an error with Retry, so
  // the summary never just stays blank; Retry bumps summaryAttempt.
  useEffect(() => {
    if (phase !== "done" || summaryLoaded) return;
    let cancelled = false;
    actions
      .getSessionSummary(sessionId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProgressNotes(result.data);
          setSummaryLoaded(true);
        } else {
          setSummaryError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSummaryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, summaryLoaded, summaryAttempt, sessionId, actions]);
  const [warmupIndex, setWarmupIndex] = useState(0);
  // B1: the exercise the latest logged set belongs to, not simply the first
  // pending one, so a resume lands where the user left off.
  const [exerciseIndex, setExerciseIndex] = useState(
    exercises.findIndex((e) => e.status === "pending") === -1 ? 0 : pickCurrentExerciseIndex(exercises),
  );

  const wakeLock = useWakeLock(phase !== "done");

  // ---- process replayed sets -----------------------------------------------
  // Track which sets have been processed to avoid re-processing
  const processedReplayedRef = useRef(new Set<string>());
  
  useEffect(() => {
    const newReplayed = pendingSetState.replayed.filter(
      (s) => !processedReplayedRef.current.has(s.clientId)
    );
    
    if (newReplayed.length === 0) return;
    
    // Mark as processed
    newReplayed.forEach((s) => processedReplayedRef.current.add(s.clientId));

    setExercises((prevExercises) => {
      return prevExercises.map((e) => {
        const replayedForExercise = newReplayed.filter(
          (s) => s.sessionExerciseId === e.id
        );
        if (replayedForExercise.length === 0) return e;

        const updatedSets = [...e.sets];
        for (const set of replayedForExercise) {
          const existingIndex = updatedSets.findIndex((s) => s.setNumber === set.setNumber);
          const newSet = {
            setNumber: set.setNumber,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSeconds: set.durationSeconds,
          };
          if (existingIndex >= 0) {
            updatedSets[existingIndex] = newSet;
          } else {
            updatedSets.push(newSet);
          }
        }
        return {
          ...e,
          sets: updatedSets.sort((a, b) => a.setNumber - b.setNumber),
        };
      });
    });
  }, [pendingSetState.replayed, setExercises]);

  // ---- rest timer -------------------------------------------------------
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restRemaining, setRestRemaining] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (restEndsAt === null) return;
    firedRef.current = false;
    const tick = () => {
      const left = Math.max(0, Math.round((restEndsAt - Date.now()) / 1000));
      setRestRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        if (settings.restSound) beeper.beep();
        if (settings.restVibrate) vibrate([180, 90, 180]);
        setRestEndsAt(null);
        // No clearRest here: loadRest drops expired values, so a reload after
        // the timer reaches 0 will find nothing to restore.
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [restEndsAt, beeper, settings.restSound, settings.restVibrate]);

  // Fresh data on resume: refresh when resuming or navigating back
  useResumeRefresh();

  /*
    B1: the props this runner mounted with may be a stale RSC payload from the
    client router cache (a soft navigation back in within `staleTimes.dynamic`
    reuses the first load's payload: old sets, the pre-swap exercise, exercise
    one current). useResumeRefresh asks the server for fresh props on mount,
    and until they arrive no set can be logged, so nothing is saved under an
    exercise the database has moved past. When they arrive the server's list
    wins, confirmed local sets are kept, and the current exercise is re-derived
    from the database's latest logged set. If the refresh never lands (offline),
    logging opens after a few seconds on what the runner has.
  */
  const [synced, markSynced] = useReducer(() => true, false);
  // Adjusted during render when the props change (React's pattern for state
  // derived from props), rather than in an effect a frame later.
  const [seenExercises, setSeenExercises] = useState(initialExercises);
  if (initialExercises !== seenExercises) {
    setSeenExercises(initialExercises);
    dispatch({ type: "merge", serverData: initialExercises });
    if (initialExercises.some((e) => e.status === "pending")) {
      setExerciseIndex(pickCurrentExerciseIndex(initialExercises));
    }
    markSynced();
  }
  useEffect(() => {
    const t = timer.setTimeout(markSynced, 4000);
    return () => timer.clearTimeout(t);
  }, [timer]);

  // Audio must be unlocked inside a real gesture; every tap is a chance.
  const onAnyTap = useCallback(() => beeper.unlock(), [beeper]);

  const current = exercises[exerciseIndex];
  const restSeconds = settings.restOverrideSeconds ?? current?.restSeconds ?? 90;

  // Stable restore callback that seeds both restEndsAt and restRemaining
  const handleRestRestore = useCallback((endsAt: number) => {
    setRestEndsAt(endsAt);
    setRestRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  }, []);

  const restPersistence = useRestPersistence(
    sessionId,
    current?.id,
    handleRestRestore,
    Date.now,
  );

  const startRest = useCallback((seconds: number) => {
    const endsAt = Date.now() + seconds * 1000;
    setRestEndsAt(endsAt);
    /*
      Seeded here rather than left to the effect's first tick. The panel renders
      on `restEndsAt`, and effects run after paint, so the frame between logging
      a set and the effect firing showed the rest panel reading 0:00 before it
      jumped to the full rest -- a timer that appears to have already finished.
      The remaining time at the moment a rest starts is exactly `seconds`.
    */
    setRestRemaining(seconds);
    
    // Persist to sessionStorage so it survives a reload
    if (current) {
      restPersistence.save(current.id, endsAt);
    }
  }, [current, restPersistence]);

  // Close the swap sheet when the active exercise changes
  useEffect(() => {
    const currentId = current?.id;
    if (currentId && alternativesForExerciseId && alternativesForExerciseId !== currentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Valid: clearing stale UI state when the active exercise changes
      setAlternatives(null);
      setAlternativesForExerciseId(null);
      setLoadingAlternatives(false);
    }
  }, [current?.id, alternativesForExerciseId]);

  // Close the swap sheet when the first set is logged for the exercise
  useEffect(() => {
    if (alternativesForExerciseId && current?.id === alternativesForExerciseId) {
      const hasSets = current.sets.length > 0;
      if (hasSets) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Valid: clearing stale UI state when sets are logged
        setAlternatives(null);
        setAlternativesForExerciseId(null);
        setLoadingAlternatives(false);
      }
    }
  }, [alternativesForExerciseId, current?.id, current?.sets.length]);

  const totalSetsPlanned = useMemo(
    () => exercises.reduce((n, e) => n + e.plannedSets, 0),
    [exercises],
  );
  const totalSetsDone = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.length, 0),
    [exercises],
  );

  /**
   * Run one server action at a time, and refuse a second while one is in
   * flight.
   *
   * Every control in this screen used to fire on every tap, and the state
   * update that hides or advances a button only happens *after* the server
   * answers. On a slow connection that leaves the button live for the whole
   * round trip, and a second tap ran the action again with the same arguments.
   * For `logSet` that appended a duplicate set number to local state: the
   * counter claimed two sets, the list showed one, the next button skipped
   * ahead, and only one row was ever written — and the exercise then finished
   * short of its planned set count, which progression reads as a missed
   * session. Twice in a row and it drops the working weight ten percent.
   *
   * The ref is what actually does the work: two taps in the same tick both see
   * a stale `busy` state, but only one can win a synchronous ref check. The
   * state exists so the buttons can show it.
   */
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  /**
   * Skipping an exercise cannot be undone — there is no navigation back to it
   * for the rest of the session — and it sat one unguarded tap away among the
   * secondary actions. Leaving is confirmed separately, inside `Shell`, since
   * that button lives in the header. Neither loses logged sets, which is why
   * both ask rather than block.
   */
  const [confirming, setConfirming] = useState<"skip" | null>(null);

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) setError("error" in r ? (r.error ?? "Something went wrong") : "Failed");
      else setError(null);
      return r.ok;
    } catch (err) {
      // h2: Catch network errors (offline, timeout, etc)
      setError(runnerErrorMessage(err));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // ---- warm-up ----------------------------------------------------------
  if (phase === "warmup") {
    const item = warmup[warmupIndex];
    const isLast = warmupIndex === warmup.length - 1;
    return (
      <Shell
        title="Warm-up"
        subtitle={`${warmupIndex + 1} of ${warmup.length}`}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
        message={message}
      >
        <div onPointerDown={onAnyTap}>
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">
            {item.phase === "cardio"
              ? "Raise your heart rate"
              : item.phase === "prehab"
                ? "Prehab — for a joint you flagged"
                : "Mobility for today's muscles"}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{item.name}</h2>
          <p className="mt-2 text-lg text-accent tabular-nums">
            {Math.round(item.duration_seconds / 60) >= 1
              ? `${Math.round(item.duration_seconds / 60)} min`
              : `${item.duration_seconds}s`}
          </p>
          {item.instructions?.length > 0 && (
            <ul className="mt-6 space-y-2 text-muted">
              {item.instructions.map((line, i) => (
                <li key={i} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 space-y-3">
            <BigButton
              disabled={busy}
              onClick={async () => {
                if (isLast) {
                  await run(() => actions.markWarmupDone(sessionId));
                  setPhase("work");
                } else {
                  setWarmupIndex((i) => i + 1);
                }
              }}
            >
              {isLast ? "Warm-up done, start training" : "Next"}
            </BigButton>
            <GhostButton
              disabled={busy}
              onClick={async () => {
                await run(() => actions.markWarmupDone(sessionId));
                setPhase("work");
              }}
            >
              Skip the rest of the warm-up
            </GhostButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- cool-down --------------------------------------------------------
  if (phase === "cooldown") {
    return (
      <Shell
        title="Cool-down"
        subtitle="5 minutes"
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
        message={message}
      >
        <RunnerStatusArea {...selectRunnerStatusProps(pendingSetState)} />
        <p className="text-muted">
          Static stretches for what you trained. Hold each for 30 seconds,
          breathing slowly and evenly. Nothing should be sharp.
        </p>
        <ul className="mt-6 space-y-2">
          {cooldown.map((w) => (
            <li
              key={w.id}
              className="rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="font-medium">{w.name}</div>
              <div className="mt-1 text-sm text-muted">Hold for {w.duration_seconds}s</div>
            </li>
          ))}
        </ul>
        <div className="mt-10 space-y-3">
          <BigButton
            disabled={isFinishDisabled(pendingSetState.pending.length, busy)}
            onClick={async () => {
              await run(() =>
                actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: settings.cooldownEnabled }),
              );
              restPersistence.clear();
              setPhase("done");
            }}
          >
            {getFinishButtonText()}
          </BigButton>
          <GhostButton
            disabled={isFinishDisabled(pendingSetState.pending.length, busy)}
            onClick={async () => {
              await run(() =>
                actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: false }),
              );
              restPersistence.clear();
              setPhase("done");
            }}
          >
            Skip cool-down
          </GhostButton>
        </div>
      </Shell>
    );
  }

  // ---- summary ----------------------------------------------------------
  if (phase === "done") {
    const changed = changeNotes;
    const personalBests = progressNotes.filter(
      (n): n is typeof n & { personalBest: string } => n.personalBest !== null,
    );
    const volume = exercises.reduce(
      (n, e) => n + e.sets.reduce((m, s) => m + (s.reps ?? 0) * (s.weightKg ?? 0), 0),
      0,
    );
    return (
      <Shell
        title="Session complete"
        subtitle={null}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
        message={message}
        confirmExit={false}
      >
        <div className="space-y-3">
          <Stat label="Time" value={formatClock(elapsed)} />
          <Stat label="Sets logged" value={`${totalSetsDone}`} />
          {volume > 0 && <Stat label="Total volume" value={formatVolumeLifted(volume, units)} />}
          <Stat
            label="Exercises"
            value={`${exercises.filter((e) => e.status === "completed").length} of ${exercises.length}`}
          />
        </div>
        {/*
          SPEC section 7 asks the summary for "PRs hit". A best that was beaten,
          not a best that was set -- a first session has nothing to beat, so it
          claims nothing. Above "what changed for next time" because it is the
          part a person actually wants to see.
        */}
        {personalBests.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
              {personalBests.length === 1 ? "Personal best" : "Personal bests"}
            </h2>
            <ul className="space-y-2">
              {personalBests.map((n, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm"
                >
                  <span className="font-semibold text-accent">{n.name}</span>
                  <p className="mt-1 text-accent">{n.personalBest}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {summaryError && (
          <section
            role="alert"
            className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          >
            <p className="text-muted">Couldn&apos;t load your summary.</p>
            <button
              type="button"
              onClick={() => {
                setSummaryError(false);
                setSummaryAttempt((n) => n + 1);
              }}
              className="rounded-lg border border-border px-3 py-1.5 font-medium"
            >
              Retry
            </button>
          </section>
        )}

        {changed.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
              What changed for next time
            </h2>
            <ul className="space-y-2">
              {changed.map((n, i) => (
                <li key={i} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                  <span className="font-semibold">{n.name}</span>
                  <p className="mt-1 text-muted">{n.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          SPEC.md section 7: "what makes the plan feel like yours". Asked here,
          once the work is done and the user knows how it went, rather than as
          an abstract question on a screen they have not earned yet.
        */}
        {tomorrow && (
          <DayPlanPrompt
            localDate={tomorrow.localDate}
            dayLabel="Tomorrow"
            plannedLabel={tomorrow.plannedLabel}
            days={tomorrow.days}
            heading="What about tomorrow?"
            onPlan={actions.planDay}
          />
        )}

        <div className="mt-10">
          <BigButton
            disabled={busy}
            onClick={async () => {
              if (onExit) return onExit();
              // Today, History and Progress all changed while this session ran.
              // The refresh happens here rather than in `finishSession`,
              // because a revalidation from there re-renders this route and its
              // completed-session guard would redirect away before the summary
              // could be read.
              await actions.refreshAfterSession();
              // The revalidation above purged Today from the client cache, so
              // this navigation fetches it fresh; a refresh as well would fetch
              // it twice.
              router.push("/today");
            }}
          >
            Back to Today
          </BigButton>
        </div>
      </Shell>
    );
  }

  // ---- work -------------------------------------------------------------
  if (!current) {
    return (
      <Shell
        title="Nothing to do"
        subtitle={null}
        elapsed={elapsed}
        onExit={() => (onExit ? onExit() : router.push("/today"))}
        wakeLock={wakeLock}
        error={error}
        message={message}
      >
        <p className="text-muted">
          This session has no exercises. That usually means the plan could not
          find anything matching your equipment, level and injuries for today.
        </p>
        <p className="mt-3 text-muted">
          Check your equipment list in Settings, then rebuild your block from
          Today.
        </p>
        <div className="mt-8">
          <BigButton onClick={() => router.push("/today")}>Back to Today</BigButton>
        </div>
      </Shell>
    );
  }

  const setsDone = current.sets.length;
  const allSetsDone = setsDone >= current.plannedSets;
  const nextSetNumberTarget = nextSetTarget(
    exercises,
    current.id,
    pendingSetState.pending
  );
  const nextSetNumber = nextSetNumberTarget?.setNumber ?? 1;
  // Prefer a weight already logged this session; otherwise start from where
  // progression left this lift (reduced during a deload week).
  const lastWeight =
    [...current.sets].reverse().find((s) => s.weightKg !== null)?.weightKg ??
    current.suggestedWeightKg;

  /**
   * What the reps field starts on — and, for the first set, nothing.
   *
   * This used to be `repsMax`, the TOP of the range. Double progression adds
   * weight precisely when every set reaches the top, so the untouched default
   * was itself a full house: tapping "Log set" four times without reading the
   * screen recorded a perfect session and earned a weight increase nobody had
   * done.
   *
   * Defaulting to the bottom of the range is no better, only wrong in the other
   * direction — four sets at the bottom reads as a missed session, and two of
   * those drop the working weight ten percent. Any prefilled number is the app
   * guessing and then recording the guess as fact.
   *
   * So the first set of an exercise has to be typed. After that the previous
   * set's reps carry forward, because that is a number the user actually
   * entered, and it saves the typing on the sets that match — which is most of
   * them.
   */
  const isTimed = current?.metric === "seconds";
  const defaultReps = isTimed
    ? ([...current.sets].reverse().find((s) => s.durationSeconds !== null)?.durationSeconds ??
      null)
    : ([...current.sets].reverse().find((s) => s.reps !== null)?.reps ?? null);

  async function onLogSet(
    displayedExerciseId: string,
    reps: number | null,
    weightKg: number | null,
    durationSeconds: number | null = null,
  ) {
    if (!controller) {
      setError("Controller not initialized");
      return;
    }

    const target = nextSetTarget(exercises, displayedExerciseId, pendingSetState.pending);
    if (!target) return;

    const clientId = `${target.sessionExerciseId}:${target.setNumber}:${now()}`;

    await createConcurrentGuard(async () => {
      setBusy(true);
      try {
        const result = await controller.submit({
          sessionExerciseId: target.sessionExerciseId,
          setNumber: target.setNumber,
          reps,
          weightKg,
          durationSeconds,
          clientId,
        });

        if (result.status === "saved") {
          if ("reason" in result && result.reason === "set_exists") {
            const conflictResult: ConflictResult = { ok: false, reason: "set_exists", savedSets: result.savedSets };
            const resolution = resolveSetConflict(exercises, target.sessionExerciseId, exerciseIndex, conflictResult);
            setExercises((prev) => resolveSetConflict(prev, target.sessionExerciseId, exerciseIndex, conflictResult).exercises);
            setExerciseIndex(resolution.nextExerciseIndex);
            setMessage(resolution.message);
            setError(null);
            return;
          }
          
          setError(null);
          setMessage(null);
          setExercises((prev) =>
            prev.map((e) =>
              e.id === target.sessionExerciseId
                ? {
                    ...e,
                    sets: [...e.sets, { setNumber: target.setNumber, reps, weightKg, durationSeconds }],
                  }
                : e,
            ),
          );
          
          const current = exercises[exerciseIndex];
          if (settings.restAutostart && target.setNumber < current.plannedSets) {
            startRest(restSeconds);
          }
        } else if (result.status === "queued") {
          // Network failure - set is queued and will be replayed
          setError(null);
          setMessage(null);
          setExercises((prev) =>
            prev.map((e) =>
              e.id === target.sessionExerciseId
                ? {
                    ...e,
                    sets: [...e.sets, { setNumber: target.setNumber, reps, weightKg, durationSeconds }],
                  }
                : e,
            ),
          );
          
          const current = exercises[exerciseIndex];
          if (settings.restAutostart && target.setNumber < current.plannedSets) {
            startRest(restSeconds);
          }
        } else if (result.status === "expired") {
          setError(null);
        } else if (result.status === "failed") {
          setError(result.error);
        }
      } catch (err) {
        setError(runnerErrorMessage(err));
      } finally {
        setBusy(false);
      }
    }, busyRef)();
  }

  /** Remove the most recently logged set, so a mistyped one can be corrected. */
  async function onUndoSet(setNumber: number) {
    const ok = await run(() => actions.deleteSet(current.id, setNumber));
    if (!ok) return;
    setExercises((prev) =>
      prev.map((e) =>
        e.id === current.id
          ? { ...e, sets: e.sets.filter((x) => x.setNumber !== setNumber) }
          : e,
      ),
    );
    setRestEndsAt(null);
    restPersistence.clear();
  }

  async function onFinishExercise(feel: Feel | null, skipped = false) {
    // Guarded like every other action: finishExercise applies progression, so
    // running it twice could add the weight increment twice.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let result;
    try {
      result = await actions.finishExercise({
        sessionExerciseId: current.id,
        feel,
        skipped,
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSessionExpired(false);
    
    // FIX (a): Store feedback from finishExercise for immediate banner display
    if (skipped || !result.data?.message) {
      setBannerContent(null);
      setChangeNotes((prev) => prev.filter((n) => n.id !== current.id));
    } else if (result.data) {
      const note = { id: current.id, name: current.name, message: result.data.message };
      setBannerContent({ name: note.name, message: note.message });
      setChangeNotes((prev) => [...prev.filter((n) => n.id !== note.id), note]);
    }
    
    setExercises((prev) =>
      prev.map((e) =>
        e.id === current.id ? { ...e, status: skipped ? "skipped" : "completed", feel } : e,
      ),
    );
    setRestEndsAt(null);
    restPersistence.clear();

    const next = exercises.findIndex((e, i) => i > exerciseIndex && e.status === "pending");
    setBannerFor(next === -1 ? null : next);
    if (next === -1) {
      if (settings.cooldownEnabled) setPhase("cooldown");
      else {
        if (shouldShowCooldownForPending(settings.cooldownEnabled, pendingSetState.pending.length)) {
          setPhase("cooldown");
          return;
        }
        await run(() =>
          actions.finishSession({ sessionId, durationSeconds: elapsed, cooldownCompleted: false }),
        );
        setPhase("done");
      }
    } else {
      setExerciseIndex(next);
    }
  }

  return (
    <Shell
      title={`Exercise ${exerciseIndex + 1} of ${exercises.length}`}
      subtitle={isDeload ? `Deload week ${week}` : `Week ${week}`}
      elapsed={elapsed}
      onExit={() => (onExit ? onExit() : router.push("/today"))}
      wakeLock={wakeLock}
      error={error}
        message={message}
    >
      <div onPointerDown={onAnyTap}>
        <RunnerStatusArea {...selectRunnerStatusProps(pendingSetState)} />
        {pendingSetState.pending.length > 0 && (
          <div className="mb-5">
            {getPendingUiMode(pendingSetState) === "replay-error" ? (
              <div className="rounded-xl border border-muted/30 bg-muted/10 px-4 py-3 text-sm text-muted">
                <p className="font-medium">Failed to save sets</p>
                <p className="mt-1">{getReplayErrorMessage(pendingSetState)}</p>
              </div>
            ) : getPendingUiMode(pendingSetState) === "expired" ? (
              <SessionExpiredPrompt />
            ) : null}
            <p className="mt-2 text-sm text-muted">
              {pendingSetState.pending.length}{" "}
              {pendingSetState.pending.length === 1 ? "set" : "sets"} waiting to save
            </p>
            {controller && (
              <div className="mt-3">
                <button
                  onClick={() => {
                    // L5: Use onFocus for manual retry to reset attempt counter
                    controller.onFocus();
                  }}
                  disabled={pendingSetState.retrying}
                  className="min-h-[44px] w-full rounded-xl border border-accent bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pendingSetState.retrying
                    ? `Saving ${pendingSetState.pending.length} ${
                        pendingSetState.pending.length === 1 ? "set" : "sets"
                      }…`
                    : `Retry saving ${pendingSetState.pending.length} ${
                        pendingSetState.pending.length === 1 ? "set" : "sets"
                      }`}
                </button>
              </div>
            )}
          </div>
        )}
        {bannerFor === exerciseIndex && bannerContent && (
          <p className="mb-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <span className="font-semibold">{bannerContent.name}:</span> {bannerContent.message}
          </p>
        )}
        <h2 className="text-3xl font-bold tracking-tight">{current.name}</h2>
        <p className="mt-2 text-accent">
          {current.plannedSets} sets × {formatTargetRange({ min: current.repsMin, max: current.repsMax, metric: current.metric })}
        </p>
        {current.cue && <p className="mt-2 text-sm text-muted">{current.cue}</p>}
        {current.workingWeightKg !== null && (
          <p className="mt-2 text-sm text-muted">
            Working weight {current.workingWeightKg} kg
            {current.suggestedWeightKg !== null &&
              current.suggestedWeightKg !== current.workingWeightKg &&
              ` · today ${current.suggestedWeightKg} kg`}
          </p>
        )}
        {isDeload && (
          <p className="mt-3 text-sm text-muted">
            Deload — keep the weight light and stop well short of failure.
          </p>
        )}

        {/*
          Shown while a rest is actually running, which is what `restEndsAt`
          means. This used to key off `restRemaining > 0`, a number the effect
          leaves untouched whenever the end time is cleared with time still on
          the clock — so the panel stayed on screen with the countdown frozen
          at whatever second it had reached, and nothing would clear it until
          the next set was logged. That happened on the rest timer's own
          "Skip" button, on Undo, and at every exercise transition.
        */}
        {restEndsAt !== null && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-5 py-4">
            <span className="text-sm text-accent">Rest</span>
            <span className="text-3xl font-bold tabular-nums text-accent">
              {formatClock(restRemaining)}
            </span>
            <button
              onClick={() => {
                setRestEndsAt(null);
                restPersistence.clear();
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-accent underline"
            >
              Skip
            </button>
          </div>
        )}

        <ol className="mt-6 space-y-2">
          {Array.from({ length: current.plannedSets }, (_, i) => i + 1).map((n) => {
            const logged = current.sets.find((s) => s.setNumber === n);
            const isPending = !logged && pendingSetState.pending.some(
              (s) => s.sessionExerciseId === current.id && s.setNumber === n
            );
            return (
              <li
                key={n}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  logged
                    ? "border-border bg-surface-2 text-muted"
                    : n === nextSetNumber
                      ? "border-accent bg-surface"
                      : "border-border bg-surface text-muted"
                }`}
              >
                <span className="text-sm font-medium">Set {n}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {logged
                      ? settings.perSetLogging
                        ? `${describeSet(logged, isTimed)}${
                            logged.weightKg ? ` · ${logged.weightKg} kg` : ""
                          }`
                        : "done"
                      : isPending
                        ? "waiting…"
                        : "—"}
                  </span>
                  {/*
                    Undo, offered only on the most recently logged set.
                    A mistyped set was previously permanent: the rows were not
                    interactive and `deleteSet` existed in the actions file
                    without ever being imported. Restricting it to the last set
                    keeps the numbering contiguous — removing set 2 of 3 would
                    leave a hole that the next "Log set" would collide with.
                  */}
                  {logged && n === setsDone && (
                    <button
                      disabled={busy}
                      onClick={() => onUndoSet(n)}
                      aria-label={`Undo set ${n}`}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-muted underline underline-offset-2 transition-colors hover:text-danger disabled:opacity-60"
                    >
                      Undo
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {!allSetsDone && (
          <SetEntry
            /*
              Keyed by exercise AND set, so the fields reset on both.
              With only the set number, moving from one exercise to the next
              at the same set number reused the component instance, and
              `useState` keeps its first value: the weight typed for the bench
              press was still sitting in the box on the lat pulldown, ready to
              be logged against it and fed to progression. It also left a stale
              number in a hold's seconds field.
            */
            key={`${current.id}:${current.exerciseId}:${nextSetNumber}`}
            perSetLogging={settings.perSetLogging}
            metric={current.metric}
            targetSeconds={current.repsMax}
            defaultWeight={lastWeight}
            defaultReps={defaultReps}
            setNumber={nextSetNumber}
            isBodyweight={current.isBodyweight}
            onLog={(reps, weightKg, durationSeconds) =>
              onLogSet(current.id, reps, weightKg, durationSeconds)
            }
            onHoldComplete={() => {
              if (settings.restSound) beeper.beep();
              if (settings.restVibrate) vibrate([180, 90, 180]);
            }}
            disabled={busy || !synced}
          />
        )}

        {allSetsDone && (
          <div className="mt-8">
            {sessionExpired && (
              <div className="mb-4">
                <SessionExpiredPrompt />
              </div>
            )}
            <p className="mb-3 text-sm font-medium">How did that feel?</p>
            <div className="grid grid-cols-3 gap-2">
              {FEELS.map((f) => (
                <button
                  key={f.value}
                  disabled={busy}
                  onClick={() => onFinishExercise(f.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {alternatives && (
          <div className="mt-8">
            <p className="mb-3 text-sm font-medium">
              Swap for something that works the same pattern
            </p>
            {alternatives.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing else matches your equipment and injuries for this movement.
              </p>
            ) : (
              <ul className="space-y-2">
                {alternatives.map((a) => (
                  <li key={a.exerciseId}>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        // Guard against stale swaps: refuse if the sheet's exercise doesn't match the current one
                        if (alternativesForExerciseId !== current.id) {
                          setError("This swap sheet belongs to a different exercise");
                          setAlternatives(null);
                          setAlternativesForExerciseId(null);
                          return;
                        }
                        // Refuse swap if the exercise has logged sets
                        if (current.sets.length > 0) {
                          setError("You've already logged a set for this exercise, so it can't be swapped.");
                          setAlternatives(null);
                          setAlternativesForExerciseId(null);
                          return;
                        }
                        /*
                          `run` reports success as a boolean, so the payload is
                          carried out in a box. It is needed: a swap can change
                          the UNIT -- the alternatives for a core slot include
                          holds on purpose -- and the server re-prescribes the
                          range when it does. Without applying both, swapping a
                          set of 8-12 reps for a plank left the screen asking
                          for reps, or for an eight-second hold.
                        */
                        const box: { value?: SwapResult } = {};
                        const ok = await run(async () => {
                          const r = await actions.swapExercise({
                            sessionExerciseId: current.id,
                            newExerciseId: a.exerciseId,
                          });
                          if (r.ok) box.value = r.data;
                          return r;
                        });
                        if (!ok || !box.value) return;
                        const swapped = box.value;
                        setExercises((prev) => {
                          // #125: Apply weight prefill and metric change
                          const withSwap = applySwapResult(prev, current.id, {
                            ...swapped,
                            exerciseId: a.exerciseId,
                            name: a.name,
                            cue: a.cue,
                          }) as RunnerExercise[];
                          
                          // #127: Apply target resolution for unloaded exercises
                          return withSwap.map((e) => {
                            if (e.id !== current.id) return e;
                            const plannedRepsMin = swapped.repsMin ?? e.plannedRepsMin;
                            const plannedRepsMax = swapped.repsMax ?? e.plannedRepsMax;
                            return applySwapTarget(
                              { ...e, plannedRepsMin, plannedRepsMax },
                              {
                                equipmentIds: swapped.equipmentIds,
                                currentTargetReps: swapped.currentTargetReps,
                                currentWorkingWeightKg: swapped.workingWeightKg,
                                plannedRepsMin,
                                plannedRepsMax,
                              }
                            );
                          });
                        });
                        setAlternatives(null);
                        setAlternativesForExerciseId(null);
                      }}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-60"
                    >
                      <span className="font-medium">{a.name}</span>
                      {a.cue && <p className="mt-1 text-xs text-muted">{a.cue}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <GhostButton onClick={() => {
                setAlternatives(null);
                setAlternativesForExerciseId(null);
              }}>Cancel</GhostButton>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-2">
          {!alternatives && current.sets.length === 0 && (
            <GhostButton
              disabled={busy || loadingAlternatives}
              onClick={async () => {
                setLoadingAlternatives(true);
                const r = await actions.findAlternatives(current.id);
                setLoadingAlternatives(false);
                if (!r.ok) return setError(r.error);
                setAlternatives(r.data);
                setAlternativesForExerciseId(current.id);
              }}
            >
              {loadingAlternatives ? "Finding alternatives…" : "Swap this exercise"}
            </GhostButton>
          )}
          {confirming === "skip" ? (
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <p className="text-sm">
                Skip {current.name}? You will not be able to come back to it in this
                session.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => {
                    setConfirming(null);
                    onFinishExercise(null, true);
                  }}
                  className="flex-1 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
                >
                  Skip it
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="flex-1 rounded-lg bg-surface px-4 py-2 text-sm font-medium"
                >
                  Keep going
                </button>
              </div>
            </div>
          ) : (
            <GhostButton disabled={busy} onClick={() => setConfirming("skip")}>
              Skip this exercise
            </GhostButton>
          )}
          <GhostButton
            disabled={isEndEarlyDisabled(busy, pendingSetState.pending.length)}
            onClick={async () => {
              if (await run(() => actions.abandonSession(sessionId, elapsed))) {
                restPersistence.clear();
                if (onExit) onExit();
                else router.push("/today");
              }
            }}
          >
            End session early
          </GhostButton>
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          {totalSetsDone} of {totalSetsPlanned} sets logged
        </p>

        <CapabilityNote
          wakeLock={wakeLock}
          soundEnabled={settings.restSound}
          soundUnlocked={beeper.unlocked}
          vibrateEnabled={settings.restVibrate}
        />
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

/**
 * What a logged set reads as.
 *
 * A set logged before its exercise became timed carries reps and no duration,
 * so a timed exercise cannot simply read `durationSeconds` — that showed "—s"
 * against work the user really did. Show whichever the row actually holds.
 */
function describeSet(
  set: { reps: number | null; durationSeconds: number | null },
  isTimed: boolean,
): string {
  if (isTimed && set.durationSeconds !== null) return `${set.durationSeconds}s`;
  if (set.reps !== null) return `${set.reps} reps`;
  return isTimed ? "—s" : "— reps";
}

function SetEntry({
  perSetLogging,
  metric,
  targetSeconds,
  defaultWeight,
  defaultReps,
  setNumber,
  isBodyweight,
  onLog,
  onHoldComplete,
  disabled = false,
}: {
  perSetLogging: boolean;
  /** `seconds` turns this into a hold: a countdown rather than a rep count. */
  metric: Database["public"]["Enums"]["exercise_metric"];
  /** Top of the target range, which is what the hold counts down from. */
  targetSeconds: number;
  defaultWeight: number | null;
  /** Null on the first set of an exercise, so it has to be entered. */
  defaultReps: number | null;
  setNumber: number;
  /** True for bodyweight exercises: changes weight label and default. */
  isBodyweight: boolean;
  onLog: (
    reps: number | null,
    weightKg: number | null,
    durationSeconds?: number | null,
  ) => void;
  /** Beep and buzz when a hold reaches zero, as the rest timer does. */
  onHoldComplete: () => void;
  disabled?: boolean;
}) {
  const isTimed = metric === "seconds";

  // Remounted per set via a key at the call site, so the fields reset naturally
  // rather than being reset from an effect.
  const [reps, setReps] = useState(defaultReps !== null ? String(defaultReps) : "");
  // For bodyweight exercises, only prefill if the last set actually used added weight.
  const shouldPrefillWeight = !isBodyweight || (defaultWeight !== null && defaultWeight > 0);
  const [weight, setWeight] = useState(
    shouldPrefillWeight && defaultWeight !== null ? String(defaultWeight) : "",
  );

  /**
   * The hold timer.
   *
   * An absolute end timestamp rather than a decrementing counter, so a phone
   * that locks or backgrounds the tab does not lose seconds — the same reason
   * the rest timer works this way. Visibility is derived from `endsAt`, never
   * from the remaining count, so clearing it always clears the panel.
   *
   * Whatever was actually held lands in the seconds field: the full target when
   * the countdown reaches zero, or the elapsed time when it is stopped early.
   * Nothing is prefilled before that, so a set nobody performed cannot be
   * logged by tapping through — the same rule the reps field follows.
   */
  const [holdEndsAt, setHoldEndsAt] = useState<number | null>(null);
  const [holdLeft, setHoldLeft] = useState(targetSeconds);
  const holdFiredRef = useRef(false);

  useEffect(() => {
    if (holdEndsAt === null) return;
    holdFiredRef.current = false;
    const tick = () => {
      const left = Math.max(0, Math.round((holdEndsAt - Date.now()) / 1000));
      setHoldLeft(left);
      if (left === 0 && !holdFiredRef.current) {
        holdFiredRef.current = true;
        setReps(String(targetSeconds));
        onHoldComplete();
        setHoldEndsAt(null);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [holdEndsAt, targetSeconds, onHoldComplete]);

  function stopHoldEarly() {
    const held = Math.max(1, targetSeconds - holdLeft);
    setReps(String(held));
    setHoldEndsAt(null);
  }

  // The same rules the server enforces, so the button explains itself before a
  // round trip rather than after one. An empty field is only meaningful when
  // per-set logging is off, where the runner records that a set happened
  // without asking for numbers; here it means the user has not said yet.
  const invalid =
    reps === ""
      ? isTimed
        ? "Hold it, or enter the seconds you held."
        : "Enter the reps you did."
      : isTimed
        ? validateSet(null, weight === "" ? null : Number(weight), Number(reps))
        : validateSet(Number(reps), weight === "" ? null : Number(weight));

  if (!perSetLogging) {
    return (
      <div className="mt-6">
        <BigButton disabled={disabled} onClick={() => onLog(null, null)}>
          Set {setNumber} done
        </BigButton>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {isTimed &&
        (holdEndsAt !== null ? (
          <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-5 py-5 text-center">
            <p className="text-sm text-accent">Hold</p>
            <p className="mt-1 text-5xl font-bold tabular-nums text-accent">
              {formatClock(holdLeft)}
            </p>
            <button
              onClick={stopHoldEarly}
              className="mt-3 rounded-lg px-3 py-1.5 text-sm text-accent underline underline-offset-2"
            >
              Stop early
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <BigButton
              disabled={disabled}
              onClick={() => {
                setHoldLeft(targetSeconds);
                setHoldEndsAt(Date.now() + targetSeconds * 1000);
              }}
            >
              Hold for {targetSeconds}s
            </BigButton>
          </div>
        ))}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">{isTimed ? "Seconds held" : "Reps"}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-4 text-center text-2xl font-semibold tabular-nums outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">{isBodyweight ? "Added weight (kg)" : "Weight (kg)"}</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={999}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="—"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-4 text-center text-2xl font-semibold tabular-nums outline-none placeholder:text-muted/50 focus:border-accent"
          />
        </label>
      </div>
      {invalid && (
        <p
          role={reps === "" ? undefined : "alert"}
          className={`mt-3 text-center text-sm ${reps === "" ? "text-muted" : "text-danger"}`}
        >
          {invalid}
        </p>
      )}
      <div className="mt-3">
        <BigButton
          disabled={disabled || invalid !== null || holdEndsAt !== null}
          onClick={() =>
            isTimed
              ? onLog(null, weight === "" ? null : Number(weight), Number(reps))
              : onLog(
                  reps === "" ? null : Number(reps),
                  weight === "" ? null : Number(weight),
                )
          }
        >
          Log set {setNumber}
        </BigButton>
      </div>
    </div>
  );
}

export function Shell({
  title,
  subtitle,
  elapsed,
  onExit,
  wakeLock,
  error,
  message,
  confirmExit = true,
  children,
}: {
  title: string;
  subtitle: string | null;
  elapsed: number;
  onExit: () => void;
  wakeLock: { active: boolean };
  error: string | null;
  message?: string | null;
  /** Off on the summary, where leaving is the expected next step. */
  confirmExit?: boolean;
  children: React.ReactNode;
}) {
  // Owned here rather than by the caller so every phase inherits the same
  // guard without repeating it. The button sits beside the elapsed clock, well
  // inside thumb reach, and used to leave mid-set on a single tap.
  const [confirmingExit, setConfirmingExit] = useState(false);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-6 pt-6 pb-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-wider text-muted uppercase">{title}</p>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {wakeLock.active && (
            <span
              title="Screen kept awake"
              aria-label="Screen kept awake"
              className="h-2 w-2 rounded-full bg-success"
            />
          )}
          <span className="text-sm tabular-nums text-muted">{formatClock(elapsed)}</span>
          <button
            onClick={() => (confirmExit ? setConfirmingExit(true) : onExit())}
            aria-label="Leave session"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted"
          >
            Exit
          </button>
        </div>
      </header>

      {confirmingExit && (
        <div
          role="alertdialog"
          aria-label="Leave session"
          className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3"
        >
          <p className="text-sm">
            Leave this session? Everything you have logged is already saved, and you
            can pick it up again from Today.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onExit}
              className="flex-1 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-danger"
            >
              Leave
            </button>
            <button
              onClick={() => setConfirmingExit(false)}
              className="flex-1 rounded-lg bg-surface px-4 py-2 text-sm font-medium"
            >
              Stay
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {message && (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg">
          {message}
        </p>
      )}

      <div className="mt-8">{children}</div>
    </main>
  );
}

function BigButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Honest readout of what this device actually supports. Wake lock, audio and
 * vibration all fail differently across browsers -- iOS Safari has never
 * implemented navigator.vibrate at all -- so the state is shown rather than
 * assumed.
 */
export function CapabilityNote({
  wakeLock,
  soundEnabled,
  soundUnlocked,
  vibrateEnabled,
}: {
  wakeLock: { supported: boolean; active: boolean; error: string | null };
  soundEnabled: boolean;
  soundUnlocked: boolean;
  vibrateEnabled: boolean;
}) {
  const vibrationSupported = useVibrationSupported();
  const bits: string[] = [];
  bits.push(
    !wakeLock.supported
      ? "screen may sleep (wake lock unsupported)"
      : wakeLock.active
        ? "screen kept awake"
        : `screen may sleep${wakeLock.error ? ` (${wakeLock.error})` : ""}`,
  );
  if (soundEnabled) bits.push(soundUnlocked ? "sound ready" : "sound arms on first tap");
  if (vibrateEnabled && !vibrationSupported) bits.push("vibration unsupported here");

  return <p className="mt-4 text-center text-[11px] text-muted/70">{bits.join(" · ")}</p>;
}
