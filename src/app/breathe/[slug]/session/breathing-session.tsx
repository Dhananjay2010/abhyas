"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  audioSupported,
  BELL_HIGH,
  BELL_LOW,
  breathAudio,
  scheduleBell,
  scheduleGlide,
  scheduleHum,
  schedulePumps,
  scheduleSwell,
  startAmbience,
  unlockBreathAudio,
  type AmbienceHandle,
  type Voice,
} from "@/lib/breathing/audio";
import {
  onVoicesChanged,
  speak,
  speechSupported,
  spokenCue,
  stopSpeech,
  warmUpSpeech,
} from "@/lib/breathing/speech";
import { openedFromApp, uuid } from "@/lib/breathing/client";
import { PausableClock } from "@/lib/breathing/clock";
import {
  buildCycle,
  nextPhaseStart,
  positionAt,
  pumpAt,
  type Position,
  type Side,
  type TimedPhase,
} from "@/lib/breathing/engine";
import { MOODS, moodLabel, type Pattern, type SessionOptions } from "@/lib/breathing/pattern";
import type { ResolvedStep, Routine } from "@/lib/breathing/routine";
import { GLOW_BG, HALO_BG, ORB_BG, SESSION_BG } from "@/lib/breathing/theme";
import { formatClock, useWakeLock, vibrate } from "@/lib/session/device";
import { formatDuration } from "@/lib/format-duration";
import {
  rateBreathingPractice,
  recordBreathingPractice,
  recordJourneyDay,
  type JourneyDayResult,
} from "../../actions";
import { BreathShape, type ShapeFrame, type ShapeHandle } from "../../breath-shape";
import { Icon, WeekStrip } from "../../controls";
import { usePrefersReducedMotion } from "../../use-media";

type Actions = {
  recordBreathingPractice: typeof recordBreathingPractice;
  rateBreathingPractice: typeof rateBreathingPractice;
  recordJourneyDay: typeof recordJourneyDay;
};
const REAL: Actions = { recordBreathingPractice, rateBreathingPractice, recordJourneyDay };

const SETTLE_SECONDS = 5;
const WIND_DOWN_SECONDS = 10;
/**
 * Between two steps of a routine. Short, because the hand-off screen that
 * follows is itself the pause -- ten seconds of wind-down and then a hand-off
 * would leave you waiting twice.
 */
const STEP_WIND_DOWN_SECONDS = 3;
/** How long the hand-off waits before the next step starts on its own. */
const HANDOFF_SECONDS = 6;
/** How far ahead each cue is put on the audio clock. */
const LOOKAHEAD = 0.25;
const CONTROLS_HIDE_MS = 3500;
const GUARD_KEY = "breatheGuard";
/**
 * The orb's box. Full size on a tall phone, and shrinking with the screen's
 * height so a short or landscape screen never pushes the words under the
 * controls.
 */
const ORB_BOX = "min(300px, 36dvh)";

const noSubscribe = () => () => {};

/** A routine being run: which practices, in order. */
export type RoutineRun = { routine: Routine; steps: ResolvedStep[] };

/** One day of a course being run. The practice itself is an ordinary practice. */
export type JourneyRun = {
  id: string;
  name: string;
  /** 1-based, as it reads on the screen. */
  day: number;
  dayCount: number;
  title: string;
};

/** Whether the day was counted, and where that leaves the course. */
type DayNote = { ok: true; result: JourneyDayResult } | { ok: false };

type SessionProps = {
  /** A single practice. Ignored when `run` is given, which supplies one per step. */
  pattern?: Pattern;
  options: SessionOptions;
  /** Set when this is a routine rather than one practice. */
  run?: RoutineRun | null;
  /** Set when this practice is a day of a course. */
  journey?: JourneyRun | null;
  /** This week before this visit: Monday..Sunday, and seconds breathed. */
  week: { days: boolean[]; seconds: number };
  /** 1..7, Monday first. */
  todayIndex: number;
  homeHref: string;
  actions?: Actions;
};

/** What the steps before this one added up to, for the routine's summary at the end. */
type Tally = { seconds: number; breaths: number; steps: number; failed: number };
const EMPTY_TALLY: Tally = { seconds: 0, breaths: 0, steps: 0, failed: 0 };

/**
 * The practice screen: full screen, no tab bar, and a back button that pauses.
 *
 * This outer part owns what must outlive one practice: the history entry that
 * turns "back" into "pause", how to leave, and the running total for the week.
 * "Again" remounts the inner practice from scratch with a new key.
 *
 * For a routine it also owns the sequence. Each step is the same `Practice`
 * component remounted with a new key, and the saves are chained: the first step
 * opens a session, every later step is given that session, so the routine is
 * one entry in History with a log per step.
 */
export function BreathingSession({ actions = REAL, ...props }: SessionProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [fromApp] = useState(() => openedFromApp());
  const [dayNote, setDayNote] = useState<DayNote | null>(null);
  const leavingRef = useRef(false);
  const finishedRef = useRef(false);
  const pauseRef = useRef<() => void>(() => {});
  const { homeHref, run, journey } = props;

  // The session the first step opened, and a queue so two steps never race to
  // open one. A step that failed to save leaves the id null, and the next step
  // opens its own session rather than losing the practice entirely.
  const sessionId = useRef<string | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  /** The first step's log, which carries both check-ins so they stay on one row. */
  const rateLogId = useRef<string | null>(null);

  const leave = useCallback(() => {
    leavingRef.current = true;
    // Opened from inside the app, the page it came from is two entries back,
    // behind the guard entry pushed below. Opened cold, there is nothing of
    // ours behind it, so go to the Breathe tab instead.
    if (fromApp) window.history.go(-2);
    else router.replace(homeHref);
  }, [fromApp, router, homeHref]);

  // Back pauses the practice instead of silently throwing it away (B6).
  //
  // An extra history entry with the same URL sits on top of the practice.
  // Pressing back pops only that entry: nothing navigates, the popstate
  // handler opens the pause sheet, and the entry goes back on. Leaving is a
  // deliberate choice from the sheet. Once the practice has finished, back
  // simply leaves.
  useEffect(() => {
    const guard = () =>
      window.history.pushState({ [GUARD_KEY]: true }, "", window.location.href);
    const state = window.history.state as Record<string, unknown> | null;
    // Strict mode runs this twice in development; one guard is enough.
    if (!state?.[GUARD_KEY]) guard();

    const onPop = () => {
      if (leavingRef.current) return;
      if (finishedRef.current) {
        leavingRef.current = true;
        if (fromApp) window.history.back();
        else router.replace(homeHref);
        return;
      }
      pauseRef.current();
      guard();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fromApp, router, homeHref]);

  const registerPause = useCallback((fn: () => void) => {
    pauseRef.current = fn;
  }, []);
  const onFinished = useCallback((finished: boolean) => {
    finishedRef.current = finished;
  }, []);
  const onSaved = useCallback((seconds: number) => setSavedSeconds((n) => n + seconds), []);

  /** Start the whole thing over: a single practice, or a routine from step one. */
  const onAgain = useCallback(() => {
    sessionId.current = null;
    rateLogId.current = null;
    chain.current = Promise.resolve();
    setDayNote(null);
    setTally(EMPTY_TALLY);
    setStep(0);
    setAttempt((a) => a + 1);
  }, []);

  const onNextStep = useCallback((done: { seconds: number; breaths: number; saved: boolean }) => {
    setTally((t) => ({
      seconds: t.seconds + done.seconds,
      breaths: t.breaths + done.breaths,
      steps: t.steps + 1,
      failed: t.failed + (done.saved ? 0 : 1),
    }));
    setStep((s) => s + 1);
  }, []);

  /**
   * Saves, in order, threading the session through.
   *
   * Serialised rather than fired in parallel because the second step must not
   * start its own session while the first is still opening one. `chain` is
   * kept un-rejected so one failed step does not block the next.
   */
  const saveStep = useCallback<typeof recordBreathingPractice>(
    (input) => {
      const next = chain.current.then(async () => {
        const r = await actions.recordBreathingPractice({
          ...input,
          sessionId: input.routineStep && input.routineStep > 1 ? sessionId.current : null,
        });
        if (r.ok) {
          sessionId.current = r.data.sessionId;
          if (rateLogId.current === null) rateLogId.current = input.logId;
        }
        return r;
      });
      chain.current = next.catch(() => {});
      return next;
    },
    [actions],
  );

  /**
   * Saves the practice, then counts the day.
   *
   * In that order and only on success, because a day of a course is not a
   * thing in its own right: it is a practice that happened. A practice ended
   * part-way counts nothing -- the course asks you to reach the end of the
   * day's practice, and the ending screen says so rather than quietly moving
   * on.
   */
  const saveDay = useCallback<typeof recordBreathingPractice>(
    async (input) => {
      const r = await actions.recordBreathingPractice(input);
      if (!r.ok || !journey || input.endedEarly) return r;
      try {
        const d = await actions.recordJourneyDay({
          journeyId: journey.id,
          day: journey.day,
          logId: input.logId,
        });
        // The practice itself is saved either way. A day that could not be
        // counted is said out loud rather than left to look finished.
        setDayNote(d.ok ? { ok: true, result: d.data } : { ok: false });
      } catch {
        setDayNote({ ok: false });
      }
      return r;
    },
    [actions, journey],
  );

  const stepActions = useMemo<Actions>(
    () => ({
      ...actions,
      recordBreathingPractice: run
        ? saveStep
        : journey
          ? saveDay
          : actions.recordBreathingPractice,
      // A routine is rated once, on the first step's log, so the "before" and
      // "after" answers stay on the same row and still read as a pair.
      rateBreathingPractice: run
        ? (input) =>
            actions.rateBreathingPractice({ ...input, logId: rateLogId.current ?? input.logId })
        : actions.rateBreathingPractice,
    }),
    [actions, run, journey, saveStep, saveDay],
  );

  const todayIdx = props.todayIndex - 1;
  const week = {
    days: props.week.days.map((d, i) => d || (savedSeconds > 0 && i === todayIdx)),
    seconds: props.week.seconds + savedSeconds,
  };

  const current = run ? run.steps[Math.min(step, run.steps.length - 1)] : null;
  const pattern = current ? current.pattern : (props.pattern as Pattern);
  const options = current ? { ...props.options, cycles: current.cycles } : props.options;

  return (
    <Practice
      key={`${attempt}:${step}`}
      {...props}
      pattern={pattern}
      options={options}
      week={week}
      actions={stepActions}
      routine={run ? run.routine : null}
      stepIndex={run ? step : 0}
      stepCount={run ? run.steps.length : 1}
      nextStep={run && step + 1 < run.steps.length ? run.steps[step + 1] : null}
      dayNote={dayNote}
      before={tally}
      registerPause={registerPause}
      onFinished={onFinished}
      onSaved={onSaved}
      onAgain={onAgain}
      onNextStep={onNextStep}
      onLeave={leave}
    />
  );
}

type Stage = "checkin" | "running" | "finished";
type Sub = "settle" | "practice" | "winddown";
type Outcome = { cycles: number; seconds: number; breaths: number; endedEarly: boolean };
type Status = { state: "idle" | "saving" | "saved" | "error"; error?: string };
type View = { sub: Sub; phase: TimedPhase; cycleIndex: number };

type PracticeProps = Omit<SessionProps, "actions" | "homeHref" | "pattern" | "run"> & {
  pattern: Pattern;
  actions: Actions;
  /** Set when this practice is one step of a routine. */
  routine: Routine | null;
  /** 0-based. Always 0 for a single practice. */
  stepIndex: number;
  stepCount: number;
  /** The step after this one, or null when this is the last. */
  nextStep: ResolvedStep | null;
  /** Whether this day of the course was counted. Null until the save lands. */
  dayNote: DayNote | null;
  /** What the earlier steps added up to, for the summary at the end. */
  before: Tally;
  registerPause: (fn: () => void) => void;
  onFinished: (finished: boolean) => void;
  onSaved: (seconds: number) => void;
  onAgain: () => void;
  onNextStep: (done: { seconds: number; breaths: number; saved: boolean }) => void;
  onLeave: () => void;
};

/**
 * One practice from the first breath to the check-in.
 *
 * Everything moving is derived each frame from a single pausable clock through
 * the engine's `positionAt`. React re-renders only when something readable
 * changes (a new phase, a new second); the orb, its glow, the ring and the
 * progress bar are written straight to the DOM from the frame callback, so the
 * motion runs at the display's own rate.
 */
function Practice({
  pattern,
  options,
  week,
  todayIndex,
  actions,
  routine,
  journey = null,
  stepIndex,
  stepCount,
  nextStep,
  dayNote,
  before,
  registerPause,
  onFinished,
  onSaved,
  onAgain,
  onNextStep,
  onLeave,
}: PracticeProps) {
  const cycle = useMemo(() => buildCycle(pattern.phases), [pattern.phases]);
  const total = cycle.seconds * options.cycles;
  // Settling in belongs at the start of a routine, not between its steps --
  // the hand-off already is the pause.
  const settle = options.settleIn && stepIndex === 0 ? SETTLE_SECONDS : 0;
  const windDown = nextStep ? STEP_WIND_DOWN_SECONDS : WIND_DOWN_SECONDS;
  const hasSides = cycle.phases.some((p) => p.side !== null);
  const pumps = cycle.phases.some((p) => p.kind === "pump");
  const reduced = usePrefersReducedMotion();
  // The server cannot know either of these. Rendering as "can play, no
  // context yet" there means a cold load asks for a tap, and a practice opened
  // from Start -- whose tap already unlocked sound -- does not.
  const canPlay = useSyncExternalStore(noSubscribe, audioSupported, () => true);
  const hasContext = useSyncExternalStore(noSubscribe, () => breathAudio() !== null, () => false);

  const [logId] = useState(() => uuid());
  const [clock] = useState(() => new PausableClock());
  // "How do you feel right now?" belongs at the start of a routine, not before
  // every step of it -- the same reasoning as the settle-in above. A routine is
  // rated as a whole, and both its answers are kept on the first step's log, so
  // asking again mid-routine interrupts the sequence to collect a number
  // nothing reads.
  const [stage, setStage] = useState<Stage>(
    options.checkIn === "both" && stepIndex === 0 ? "checkin" : "running",
  );
  const [tapped, setTapped] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseAt, setPauseAt] = useState({ t: 0, cycles: 0 });
  const [soundOn, setSoundOn] = useState(options.guidance !== "off");
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [view, setView] = useState<View>({
    sub: settle > 0 ? "settle" : "practice",
    phase: cycle.phases[0],
    cycleIndex: 0,
  });
  const [count, setCount] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(total));
  const [controls, setControls] = useState(true);
  const [announce, setAnnounce] = useState("");
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [save, setSave] = useState<Status>({ state: "idle" });
  const [rate, setRate] = useState<Status>({ state: "idle" });
  /** "End here" on a routine's hand-off: finish now rather than go on. */
  const [stopHere, setStopHere] = useState(false);

  // Voice falls back to tones on a browser that cannot speak, and says so.
  const canSpeak = useSyncExternalStore(onVoicesChanged, speechSupported, () => true);
  const wantsVoice = options.guidance === "voice";
  /** What is actually playing. Turning sound back on after choosing "off" gives tones. */
  const mode: "tones" | "ocean" | "voice" =
    wantsVoice && canSpeak ? "voice" : options.guidance === "ocean" ? "ocean" : "tones";

  const needsTap = stage === "running" && soundOn && canPlay && !hasContext && !tapped;
  const live = stage === "running" && !paused && !needsTap;
  useWakeLock(live);

  const shapeRef = useRef<ShapeHandle>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);

  const keyRef = useRef("");
  const countRef = useRef<number | null>(null);
  const leftRef = useRef(Math.ceil(total));
  const blockedRef = useRef(false);
  const scheduled = useRef(new Set<string>());
  const voices = useRef<Array<{ voice: Voice; until: number }>>([]);
  const ambience = useRef<AmbienceHandle | null>(null);
  const modeRef = useRef(mode);
  const savedRef = useRef(false);
  /** Whether this step's save actually landed, so the routine's summary can be honest. */
  const savedOkRef = useRef(false);
  const pendingMood = useRef<number | null>(null);
  const soundOnRef = useRef(soundOn);
  const stageRef = useRef(stage);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    stageRef.current = stage;
    onFinished(stage === "finished");
  }, [stage, onFinished]);

  /** Silence everything sounding or scheduled, and forget what was scheduled. */
  const stopVoices = useCallback(() => {
    const when = breathAudio()?.ctx.currentTime;
    for (const v of voices.current) v.voice.stop(when);
    voices.current = [];
    ambience.current?.stop(when);
    ambience.current = null;
    stopSpeech();
    scheduled.current.clear();
  }, []);

  const sendMood = useCallback(
    (m: number) => {
      setRate({ state: "saving" });
      actions.rateBreathingPractice({ logId, moodAfter: m }).then(
        (r) => setRate(r.ok ? { state: "saved" } : { state: "error", error: r.error }),
        () => setRate({ state: "error", error: "Could not reach the server." }),
      );
    },
    [actions, logId],
  );

  const doSave = useCallback(
    (o: Outcome) => {
      setSave({ state: "saving" });
      actions
        .recordBreathingPractice({
          logId,
          // A practice of your own has no built-in behind it; a built-in you
          // have retimed carries both, so history still groups it correctly.
          patternId: pattern.kind === "mine" ? null : pattern.id,
          userPatternId: pattern.userPatternId,
          cycles: o.cycles,
          plannedCycles: options.cycles,
          breaths: o.breaths,
          seconds: o.seconds,
          endedEarly: o.endedEarly,
          moodBefore,
          guidance: soundOnRef.current ? modeRef.current : "off",
          routineId: routine?.id ?? null,
          routineStep: routine ? stepIndex + 1 : null,
        })
        .then(
          (r) => {
            if (!r.ok) {
              setSave({ state: "error", error: r.error });
              savedOkRef.current = false;
              return;
            }
            setSave({ state: "saved" });
            savedOkRef.current = true;
            onSaved(o.seconds);
            const m = pendingMood.current;
            if (m !== null) {
              pendingMood.current = null;
              sendMood(m);
            }
          },
          () =>
            setSave({
              state: "error",
              error: "Could not reach the server. Check your connection and try again.",
            }),
        );
    },
    [
      actions,
      logId,
      pattern.id,
      pattern.kind,
      pattern.userPatternId,
      options.cycles,
      moodBefore,
      onSaved,
      sendMood,
      routine,
      stepIndex,
    ],
  );
  const doSaveRef = useRef(doSave);
  useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  const requestPause = useCallback(() => {
    if (stageRef.current !== "running") return;
    const t = clock.elapsed() - settle;
    setPauseAt({
      t: Math.max(0, Math.min(t, total)),
      cycles: t > 0 ? positionAt(cycle, options.cycles, t).completedCycles : 0,
    });
    setPaused(true);
  }, [clock, settle, total, cycle, options.cycles]);

  useEffect(() => {
    registerPause(requestPause);
  }, [registerPause, requestPause]);

  // Leaving the app pauses the practice. iOS stops the audio at that point
  // anyway, and coming back to a practice that raced on without you is worse.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) requestPause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [requestPause]);

  // Space pauses and resumes; Escape pauses.
  useEffect(() => {
    if (stage !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Escape") return;
      if ((e.target as HTMLElement | null)?.closest("button")) return;
      e.preventDefault();
      if (!paused) requestPause();
      else if (e.key === " ") setPaused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, paused, requestPause]);

  useEffect(() => {
    if (paused) resumeRef.current?.focus();
  }, [paused]);

  // The controls step back after a few seconds; a tap anywhere brings them back.
  useEffect(() => {
    if (!controls || !live) return;
    const id = window.setTimeout(() => setControls(false), CONTROLS_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [controls, live]);

  // ---- the frame loop ------------------------------------------------------
  useEffect(() => {
    if (!live) return;
    clock.resume();
    let raf = 0;

    const paint = (frame: ShapeFrame, overall: number) => {
      shapeRef.current?.paint(frame);
      const glow = glowRef.current;
      if (glow) {
        glow.style.opacity = String(0.15 + 0.55 * frame.size);
        if (!reduced) glow.style.transform = `scale(${0.62 + 0.5 * frame.size})`;
      }
      if (haloRef.current) haloRef.current.style.opacity = String(0.25 + 0.75 * frame.size);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, overall))})`;
      }
    };

    /** Nothing is being breathed: the settle-in and the wind-down. */
    const still: ShapeFrame = {
      size: 0,
      progress: 0,
      cycleProgress: 0,
      kind: "hold",
      side: null,
    };

    const keep = (voice: Voice, until: number) => {
      voices.current.push({ voice, until });
      if (voices.current.length > 48) {
        const now = breathAudio()?.ctx.currentTime ?? 0;
        voices.current = voices.current.filter((v) => v.until > now);
      }
    };

    const sound = (t: number, pos: Position | null) => {
      if (!soundOnRef.current) return;
      const audio = breathAudio();
      if (!audio) return;
      const blocked = audio.ctx.state !== "running";
      if (blocked !== blockedRef.current) {
        blockedRef.current = blocked;
        setSoundBlocked(blocked);
      }
      if (blocked) return;

      const { ctx, out } = audio;
      const now = ctx.currentTime;
      const done = scheduled.current;

      // The bed underneath, started as soon as sound is allowed and stopped
      // with everything else on a pause.
      if (options.ambience !== "none" && !ambience.current) {
        ambience.current = startAmbience(ctx, out, options.ambience, options.ambienceVolume, now + 0.05);
      }

      /**
       * What a phase sounds like, in whichever mode is playing.
       *
       * A hummed phase is a hum in every mode: it is the practice's own
       * instruction, not decoration. Voice says the cue at the boundary
       * instead, so nothing is scheduled for it here.
       */
      const schedulePhase = (p: TimedPhase, at: number, duration: number, fromSize: number) => {
        if (duration <= 0.3) return;
        if (p.hum) {
          keep(scheduleHum(ctx, out, { at, duration }), at + duration);
          return;
        }
        // Pumping keeps its knocks in every mode -- they are the tempo, not
        // decoration, and a voice cannot count at one a second. A rest is
        // silent on purpose: nothing is being paced.
        if (p.kind === "pump") {
          keep(schedulePumps(ctx, out, { at, count: p.pumps, rate: p.rate }), at + duration);
          return;
        }
        if (p.kind === "rest") return;
        if (modeRef.current === "voice") return;
        if (modeRef.current === "ocean") {
          keep(
            scheduleSwell(ctx, out, {
              at,
              duration,
              fromSize,
              // A hold is a wave that holds its level.
              toSize: p.kind === "hold" ? fromSize : p.to,
            }),
            at + duration,
          );
          return;
        }
        if (p.kind === "hold") {
          keep(
            scheduleBell(ctx, out, { at, hz: fromSize >= 0.5 ? BELL_HIGH : BELL_LOW, peak: 0.05, decay: 1.4 }),
            at + 1.5,
          );
          return;
        }
        keep(scheduleGlide(ctx, out, { at, duration, fromSize, toSize: p.to }), at + duration);
      };

      // Three soft ticks counting into the first breath.
      if (t < 0) {
        for (const k of [3, 2, 1]) {
          const key = `tick-${k}`;
          const at = -k;
          if (!done.has(key) && at - t <= LOOKAHEAD && at >= t - 0.05) {
            done.add(key);
            const when = now + Math.max(0, at - t);
            keep(scheduleBell(ctx, out, { at: when, hz: BELL_HIGH * 1.5, peak: 0.03, decay: 0.4 }), when + 0.5);
          }
        }
      }

      // The phase already under way, if nothing is sounding for it: after a
      // resume, or when sound has only just been allowed.
      if (pos && !pos.done) {
        const key = `${pos.cycleIndex}:${pos.phase.index}`;
        if (!done.has(key)) {
          done.add(key);
          schedulePhase(pos.phase, now + 0.02, pos.phaseRemaining, pos.size);
        }
      }

      // The next phase, placed exactly on its boundary a moment ahead of time.
      const next = nextPhaseStart(cycle, options.cycles, t);
      if (next && next.at - t <= LOOKAHEAD) {
        const key = `${next.cycleIndex}:${next.phase.index}`;
        if (!done.has(key)) {
          done.add(key);
          const p = next.phase;
          schedulePhase(p, now + Math.max(0, next.at - t), p.seconds, p.from);
        }
      }

      // A low bell as the last breath ends.
      if (!done.has("end") && t < total && total - t <= LOOKAHEAD) {
        done.add("end");
        const at = now + (total - t);
        keep(scheduleBell(ctx, out, { at, hz: BELL_LOW, peak: 0.07, decay: 3 }), at + 3);
      }
    };

    const frame = () => {
      const t = clock.elapsed() - settle;

      if (t < 0) {
        if (keyRef.current !== "settle") {
          keyRef.current = "settle";
          setView((v) => ({ ...v, sub: "settle" }));
          setAnnounce("Settle in. Sit comfortably and breathe out fully.");
        }
        const c = -t <= 3 ? Math.ceil(-t) : null;
        if (c !== countRef.current) {
          countRef.current = c;
          setCount(c);
        }
        paint(still, 0);
        sound(t, null);
      } else if (t < total) {
        const pos = positionAt(cycle, options.cycles, t);
        const key = `${pos.cycleIndex}:${pos.phase.index}`;
        if (key !== keyRef.current) {
          keyRef.current = key;
          setView({ sub: "practice", phase: pos.phase, cycleIndex: pos.cycleIndex });
          setAnnounce(
            pos.phase.kind === "pump"
              ? `${pos.phase.cue}. ${pos.phase.pumps} pumps, one every ${
                  pos.phase.rate === 1 ? "second" : `${(1 / pos.phase.rate).toFixed(1)} seconds`
                }.`
              : `${pos.phase.cue}. ${Math.round(pos.phase.seconds)} seconds.`,
          );
          // Speech cannot be put on the audio clock, so it is said as the
          // phase turns -- within a frame of the sound the other modes make.
          if (soundOnRef.current && modeRef.current === "voice") {
            const before = cycle.phases[(pos.phase.index - 1 + cycle.phases.length) % cycle.phases.length];
            speak(spokenCue(pos.phase, options.voiceLang, before.kind === "inhale"), options.voiceLang);
          }
          if (options.vibrate) {
            // Once at the turn of the phase. A buzz per pump would be a
            // second tempo running against the one you are following.
            vibrate(pos.phase.kind === "inhale" ? 60 : pos.phase.kind === "exhale" ? [30, 40, 30] : 20);
          }
        }
        // Pumping counts pumps, not seconds: the number you are following is
        // "twelve of twenty", and a seconds countdown alongside it would be a
        // second thing to track.
        const c = !options.showCount
          ? null
          : pos.phase.kind === "pump"
            ? pumpAt(pos.phase, pos.phaseElapsed)
            : Math.max(1, Math.ceil(pos.phaseRemaining - 1e-6));
        if (c !== countRef.current) {
          countRef.current = c;
          setCount(c);
        }
        const left = Math.max(0, Math.ceil(total - t - 1e-6));
        if (left !== leftRef.current) {
          leftRef.current = left;
          setSecondsLeft(left);
        }
        paint(
          {
            size: pos.size,
            progress: pos.progress,
            // One side of the square per phase, so a whole cycle draws the box.
            cycleProgress: (pos.phase.index + pos.progress) / cycle.phases.length,
            kind: pos.phase.kind,
            side: pos.phase.side,
          },
          t / total,
        );
        sound(t, pos);
      } else {
        // The last breath is done. It is saved now, before the wind-down, so
        // closing the app during the last ten seconds loses nothing.
        if (!savedRef.current) {
          savedRef.current = true;
          const o: Outcome = {
            cycles: options.cycles,
            seconds: Math.round(total),
            breaths: options.cycles * cycle.breaths,
            endedEarly: false,
          };
          setOutcome(o);
          doSaveRef.current(o);
        }
        if (t >= total + windDown) {
          setStage("finished");
          return;
        }
        if (keyRef.current !== "winddown") {
          keyRef.current = "winddown";
          setView((v) => ({ ...v, sub: "winddown" }));
          setAnnounce("That was the last breath. Let your breathing return to normal.");
          countRef.current = null;
          setCount(null);
          leftRef.current = 0;
          setSecondsLeft(0);
          if (options.vibrate) vibrate([40, 60, 40]);
        }
        paint(still, 1);
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clock.pause();
      stopVoices();
    };
  }, [
    live,
    clock,
    settle,
    total,
    windDown,
    cycle,
    options.cycles,
    options.showCount,
    options.vibrate,
    options.ambience,
    options.ambienceVolume,
    options.voiceLang,
    reduced,
    stopVoices,
  ]);

  // Silence on the way out, whatever the way out was.
  useEffect(() => stopVoices, [stopVoices]);

  // ---- actions -------------------------------------------------------------

  /**
   * Everything sound needs from a tap, in one place.
   *
   * iOS grants Web Audio and speech separately, and both only from inside a
   * gesture -- speech again after the app has been in the background, which is
   * why Resume warms it up too.
   */
  const allowSound = () => {
    if (!soundOn) return;
    unlockBreathAudio();
    if (mode === "voice") warmUpSpeech(options.voiceLang);
  };

  const begin = () => {
    allowSound();
    setTapped(true);
    setStage("running");
  };

  const resume = () => {
    allowSound();
    setPaused(false);
    setControls(true);
  };

  const skipSettle = () => {
    stopVoices();
    clock.advance(Math.max(0, settle - clock.elapsed()));
  };

  const endAndSave = () => {
    const o: Outcome = {
      cycles: pauseAt.cycles,
      seconds: Math.max(1, Math.round(pauseAt.t)),
      breaths: pauseAt.cycles * cycle.breaths,
      endedEarly: true,
    };
    savedRef.current = true;
    setOutcome(o);
    doSave(o);
    setPaused(false);
    setStage("finished");
  };

  const finish = () => {
    setPaused(false);
    setStage("finished");
  };

  const toggleSound = () => {
    if (soundOn) {
      setSoundOn(false);
      stopVoices();
    } else {
      unlockBreathAudio();
      if (mode === "voice") warmUpSpeech(options.voiceLang);
      setSoundOn(true);
    }
  };

  const chooseMoodAfter = (m: number) => {
    setMoodAfter(m);
    if (save.state === "saved") sendMood(m);
    else pendingMood.current = m;
  };

  const again = () => {
    allowSound();
    onAgain();
  };

  // ---- screens -------------------------------------------------------------

  if (stage === "checkin") {
    return (
      <Room>
        <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
          <div aria-hidden="true" className="breath-idle h-24 w-24 rounded-full" style={{ background: ORB_BG }} />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">How do you feel right now?</h1>
          <p className="mt-2 text-sm text-breath-ink/70">One tap. You will be asked again at the end.</p>
          <MoodPicker
            value={moodBefore}
            onPick={(m) => {
              setMoodBefore(m);
              begin();
            }}
            className="mt-8 w-full"
          />
          <button
            type="button"
            onClick={begin}
            className="mt-6 px-4 py-2 text-sm text-breath-ink/60 underline underline-offset-4 hover:text-breath-ink"
          >
            Skip
          </button>
        </div>
      </Room>
    );
  }

  // Between two steps of a routine: what is next, and a moment before it.
  if (stage === "finished" && outcome && nextStep && !stopHere) {
    return (
      <Handoff
        routine={routine}
        next={nextStep}
        stepNumber={stepIndex + 2}
        stepCount={stepCount}
        justDone={pattern.name}
        onGo={() => {
          allowSound();
          onNextStep({
            seconds: outcome.seconds,
            breaths: outcome.breaths,
            saved: savedOkRef.current,
          });
        }}
        onStop={() => setStopHere(true)}
      />
    );
  }

  if (stage === "finished" && outcome) {
    const weekMinutes = formatDuration(week.seconds);
    // A routine's summary is the whole thing, not just its last step.
    const seconds = before.seconds + outcome.seconds;
    const breaths = before.breaths + outcome.breaths;
    const title = outcome.endedEarly || stopHere ? "Every breath counts." : "Nicely done.";
    const stepsDone = before.steps + 1;
    return (
      <Room>
        <div
          className="mx-auto flex min-h-full max-w-md flex-col px-6"
          style={{
            paddingTop: "calc(3rem + env(safe-area-inset-top))",
            paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
          }}
        >
          <div aria-hidden="true" className="breath-idle mx-auto h-20 w-20 rounded-full" style={{ background: ORB_BG }} />
          <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-center text-sm text-breath-ink/70">
            {/* A pumping practice counts its pumps, the same word the round
                itself used. A routine mixes practices, so it stays breaths. */}
            {formatClock(seconds)} · {breaths}{" "}
            {!routine && pumps
              ? breaths === 1
                ? "pump"
                : "pumps"
              : breaths === 1
                ? "breath"
                : "breaths"}{" "}
            · {routine ? routine.name : pattern.name}
          </p>
          {routine && (
            <p className="mt-1 text-center text-xs text-breath-ink/55">
              {/* "All 3 steps" only when all three were actually breathed
                  through. Reaching the last step and stopping part-way is
                  "3 of 3", not all of them. */}
              {stepsDone === stepCount && !outcome.endedEarly
                ? `All ${stepCount} steps`
                : `${stepsDone} of ${stepCount} steps`}
            </p>
          )}
          {journey && (
            <DayLine journey={journey} note={dayNote} endedEarly={outcome.endedEarly} />
          )}

          {options.checkIn !== "off" && (
            <section className="mt-10">
              <h2 className="text-center text-sm font-medium">How do you feel now?</h2>
              <MoodPicker value={moodAfter} onPick={chooseMoodAfter} className="mt-4" />
              {moodBefore !== null && moodAfter !== null && (
                <p className="mt-4 text-center text-sm text-breath">
                  {moodLabel(moodBefore)} → {moodLabel(moodAfter)}
                </p>
              )}
              {rate.state === "error" && (
                <p role="alert" className="mt-3 text-center text-xs text-danger">
                  Your answer was not saved: {rate.error}
                </p>
              )}
            </section>
          )}

          <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">This week</h2>
              <span className="text-sm tabular-nums text-breath-ink/70">{weekMinutes}</span>
            </div>
            <WeekStrip days={week.days} todayIndex={todayIndex} className="mt-3" />
          </section>

          <SaveLine status={save} onRetry={() => doSave(outcome)} />
          {before.failed > 0 && (
            <p role="alert" className="mt-2 text-center text-xs text-danger">
              {before.failed === 1 ? "An earlier step" : `${before.failed} earlier steps`} of this
              routine could not be saved.
            </p>
          )}

          <div className="mt-auto grid grid-cols-2 gap-3 pt-10">
            <button
              type="button"
              onClick={again}
              className="rounded-xl border border-white/15 px-6 py-4 font-semibold transition-colors hover:border-white/30"
            >
              Again
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Done
            </button>
          </div>
        </div>
      </Room>
    );
  }

  const cue =
    view.sub === "settle"
      ? "Settle in"
      : view.sub === "winddown"
        ? "Let your breath return to normal"
        : view.phase.cue;
  const cueKey = view.sub === "practice" ? `${view.cycleIndex}:${view.phase.index}` : view.sub;
  const aside =
    view.sub === "settle"
      ? "Sit comfortably, shoulders soft. When you are ready, breathe out fully."
      : view.sub === "winddown"
        ? "Notice how you feel."
        : view.phase.kind === "pump"
          ? "Belly in sharply. Let the breath in happen by itself."
          : // Nothing is being paced through a rest, so the orb holds still and
            // the ring around it counts down to the next round.
            view.phase.kind === "rest"
            ? "Nothing to follow. The ring fills until the next round."
            : null;
  const fade = `transition-opacity duration-300 ${controls ? "opacity-100" : "pointer-events-none opacity-0"}`;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden text-breath-ink select-none"
      style={{ background: SESSION_BG }}
      onClick={() => setControls((c) => !c)}
    >
      <div
        ref={haloRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: HALO_BG, opacity: 0.25 }}
      />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <header
        className="relative mx-auto w-full max-w-md shrink-0 px-6"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-breath-ink/70">{pattern.name}</span>
          <span className="tabular-nums text-breath-ink/80">
            {view.sub === "winddown" ? "Done" : formatClock(secondsLeft)}
          </span>
        </div>
        {routine && (
          <p className="mt-1 text-xs text-breath-ink/45">
            {routine.name} · step {stepIndex + 1} of {stepCount}
          </p>
        )}
        {journey && (
          <p className="mt-1 text-xs text-breath-ink/45">
            {journey.name} · day {journey.day} of {journey.dayCount}
          </p>
        )}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-breath-ink/10">
          <div
            ref={barRef}
            className="h-full origin-left rounded-full bg-breath"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        {routine && (
          // Where this step sits in the routine, so the progress bar above it
          // reads as "this practice" rather than "the whole thing".
          <div aria-hidden="true" className="mt-1.5 flex gap-1">
            {Array.from({ length: stepCount }, (_, i) => (
              <span
                key={i}
                className={`h-0.5 flex-1 rounded-full ${
                  i < stepIndex ? "bg-breath/70" : i === stepIndex ? "bg-breath/40" : "bg-breath-ink/10"
                }`}
              />
            ))}
          </div>
        )}
      </header>

      {soundOn && soundBlocked && (
        <div className="relative mt-3 flex shrink-0 justify-center px-6">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              allowSound();
            }}
            className="rounded-full border border-breath/40 px-4 py-2 text-xs text-breath"
            style={{ background: "rgba(11, 22, 34, 0.85)" }}
          >
            The browser paused the sound. Tap to turn it back on.
          </button>
        </div>
      )}

      {soundOn && !soundBlocked && wantsVoice && !canSpeak && (
        <p className="relative mt-3 shrink-0 px-6 text-center text-xs text-breath-ink/60">
          This browser cannot speak, so tones are playing instead.
        </p>
      )}

      {/* A column, not absolute positioning: whatever the screen's height, the
          orb and its words sit between the top bar and the controls. */}
      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <div
          className="relative grid shrink-0 place-items-center"
          style={{ width: ORB_BOX, height: ORB_BOX }}
        >
          <div
            ref={glowRef}
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{ background: GLOW_BG, filter: "blur(16px)", opacity: 0.15, transform: "scale(0.62)" }}
          />
          {/* The practice's own shape, and the ring around it. Both are drawn
              by `paint` from the frame callback, never through React. */}
          <BreathShape
            ref={shapeRef}
            shape={pattern.shape}
            reduced={reduced}
            className="absolute inset-0"
          />
        </div>

        <div className="mt-[min(1.75rem,3dvh)] min-h-24 max-w-sm shrink-0 text-center">
          <p key={cueKey} className="breath-fade text-[1.7rem] leading-tight font-semibold tracking-tight">
            {cue}
          </p>
          {aside && <p className="mt-2 text-sm leading-relaxed text-breath-ink/65">{aside}</p>}
          {count !== null && (
            <p aria-hidden="true" className="mt-2 text-lg tabular-nums text-breath-ink/55">
              {/* Pumping counts up to the round's total; everything else
                  counts the seconds of the phase down. */}
              {view.sub === "practice" && view.phase.kind === "pump"
                ? `${count} / ${view.phase.pumps}`
                : count}
            </p>
          )}
          {hasSides && view.sub === "practice" && <NostrilGuide open={view.phase.side} />}
          {view.sub === "settle" && !paused && !needsTap && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                skipSettle();
              }}
              className="mt-3 px-4 py-2 text-sm text-breath-ink/70 underline underline-offset-4 hover:text-breath-ink"
            >
              Start now
            </button>
          )}
        </div>
      </main>

      <footer
        className="relative mx-auto flex w-full max-w-md shrink-0 items-center justify-between px-8 pt-3"
        style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}
      >
        {view.sub === "winddown" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              finish();
            }}
            className="mx-auto rounded-full border border-breath-ink/25 px-8 py-3 text-sm font-semibold transition-colors hover:border-breath-ink/50"
          >
            Finish
          </button>
        ) : (
          <>
            {canPlay ? (
              <button
                type="button"
                aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
                aria-pressed={soundOn}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSound();
                }}
                className={`grid h-12 w-12 place-items-center rounded-full text-breath-ink/80 ${fade}`}
              >
                {soundOn ? <Icon.Sound /> : <Icon.Muted />}
              </button>
            ) : (
              <span className="h-12 w-12" />
            )}
            <button
              type="button"
              aria-label="Pause"
              onClick={(e) => {
                e.stopPropagation();
                requestPause();
              }}
              className="grid h-16 w-16 place-items-center rounded-full border border-breath-ink/20 bg-white/5 transition-opacity duration-300"
              style={{ opacity: controls ? 1 : 0.45 }}
            >
              <Icon.Pause />
            </button>
            <button
              type="button"
              aria-label="End practice"
              onClick={(e) => {
                e.stopPropagation();
                requestPause();
              }}
              className={`h-12 w-12 rounded-full flex items-center justify-center text-sm text-breath-ink/80 ${fade} focus-visible:opacity-100`}
            >
              End
            </button>
          </>
        )}
      </footer>

      {needsTap && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-end px-6"
          style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))", background: "rgba(0, 0, 0, 0.35)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              unlockBreathAudio();
              setTapped(true);
            }}
            className="w-full max-w-sm rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg"
          >
            Begin
          </button>
          <p className="mt-3 max-w-sm text-center text-xs leading-relaxed text-breath-ink/65">
            Your browser needs a tap before the guide can make any sound.
          </p>
        </div>
      )}

      {paused && (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-black/55"
          onClick={(e) => {
            e.stopPropagation();
            resume();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-white/10 px-6 pt-6"
            style={{ background: "#0f1d2a", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
          >
            <h2 id="pause-title" className="text-xl font-semibold tracking-tight">
              Paused
            </h2>
            <p className="mt-1 text-sm text-breath-ink/70">
              {view.sub === "settle"
                ? "You have not started yet."
                : view.sub === "winddown"
                  ? "Your practice is done."
                  : `${formatClock(Math.round(pauseAt.t))} so far · ${pauseAt.cycles * cycle.breaths} full ${
                      pauseAt.cycles * cycle.breaths === 1 ? "breath" : "breaths"
                    }`}
            </p>
            <button
              ref={resumeRef}
              type="button"
              onClick={resume}
              className="mt-6 w-full rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Resume
            </button>
            {view.sub === "practice" && pauseAt.cycles > 0 && (
              <button
                type="button"
                onClick={endAndSave}
                className="mt-3 w-full rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold transition-colors hover:border-white/30"
              >
                End and save
              </button>
            )}
            {view.sub === "winddown" ? (
              <button
                type="button"
                onClick={finish}
                className="mt-3 w-full rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold transition-colors hover:border-white/30"
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                onClick={onLeave}
                className="mt-2 w-full px-6 py-3 text-sm text-breath-ink/60 transition-colors hover:text-breath-ink"
              >
                {view.sub === "practice" && pauseAt.cycles > 0 ? "Discard this practice" : "Leave"}
              </button>
            )}
            {view.sub === "practice" && pauseAt.cycles === 0 && (
              <p className="mt-1 text-center text-xs text-breath-ink/50">
                Finish one full round to be able to save it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Room({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto text-breath-ink" style={{ background: SESSION_BG }}>
      {children}
    </div>
  );
}

/**
 * Between two steps of a routine.
 *
 * It starts the next step on its own, because a routine you have to tap
 * through four times is not a routine. The countdown is visible and can be
 * taken either way: "Start now" skips the wait, "End here" stops the routine
 * and goes to the ending, where what you have done is already saved.
 */
function Handoff({
  routine,
  next,
  stepNumber,
  stepCount,
  justDone,
  onGo,
  onStop,
}: {
  routine: Routine | null;
  next: ResolvedStep;
  /** 1-based number of the step about to start. */
  stepNumber: number;
  stepCount: number;
  justDone: string;
  onGo: () => void;
  onStop: () => void;
}) {
  const [left, setLeft] = useState(HANDOFF_SECONDS);
  const goRef = useRef(onGo);
  useEffect(() => {
    goRef.current = onGo;
  }, [onGo]);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = HANDOFF_SECONDS - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) {
        clearInterval(id);
        setLeft(0);
        goRef.current();
      } else {
        setLeft(remaining);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <Room>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-xs font-semibold tracking-wider text-breath uppercase">
          {justDone} done
        </p>
        <div aria-hidden="true" className="breath-idle mt-8 h-20 w-20 rounded-full" style={{ background: ORB_BG }} />

        <p className="mt-8 text-sm text-breath-ink/60">
          {routine ? `${routine.name} · ` : ""}step {stepNumber} of {stepCount}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{next.pattern.name}</h1>
        <p className="mt-2 text-sm text-breath-ink/70">
          {next.label}
          {next.pattern.subtitle ? ` · ${next.pattern.subtitle}` : ""}
        </p>

        <p aria-live="polite" className="mt-8 text-sm tabular-nums text-breath-ink/55">
          Starting in {left}
        </p>

        <div className="mt-8 grid w-full grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onStop}
            className="rounded-xl border border-white/15 px-6 py-4 font-semibold transition-colors hover:border-white/30"
          >
            End here
          </button>
          <button
            type="button"
            onClick={onGo}
            className="rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Start now
          </button>
        </div>
      </div>
    </Room>
  );
}

function MoodPicker({
  value,
  onPick,
  className = "",
}: {
  value: number | null;
  onPick: (m: number) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How you feel, from tense to calm"
      className={`grid grid-cols-5 gap-1.5 ${className}`}
    >
      {MOODS.map((m) => {
        const on = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(m.value)}
            className="flex flex-col items-center gap-2 rounded-xl py-2 transition-colors hover:bg-white/5"
          >
            <span
              aria-hidden="true"
              className={`h-10 w-10 rounded-full border-2 transition-colors ${on ? "border-breath" : "border-white/15"}`}
              style={{ background: `rgba(111, 216, 210, ${0.05 + m.value * 0.08})` }}
            />
            <span className={`text-[11px] ${on ? "font-semibold text-breath" : "text-breath-ink/70"}`}>
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NostrilGuide({ open }: { open: Side | null }) {
  return (
    <div aria-hidden="true" className="mt-4 flex items-center justify-center gap-8">
      {(["left", "right"] as const).map((side) => {
        const on = open === side;
        return (
          <div key={side} className="flex flex-col items-center gap-1.5">
            <span
              className={`h-6 w-4 rounded-full border transition-all duration-500 ${
                on ? "border-breath bg-breath shadow-[0_0_14px_rgba(111,216,210,0.75)]" : "border-breath-ink/25"
              }`}
            />
            <span className={`text-[11px] ${on ? "text-breath" : "text-breath-ink/40"}`}>
              {side === "left" ? "Left" : "Right"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where a day of a course leaves you.
 *
 * Every case is said plainly, including the two that are not progress: a
 * practice stopped part-way does not count a day, and a day already counted
 * today stays counted once. Silence in either case would read as "done", and
 * you would find out tomorrow that the course had not moved.
 */
function DayLine({
  journey,
  note,
  endedEarly,
}: {
  journey: JourneyRun;
  note: DayNote | null;
  endedEarly: boolean;
}) {
  const line = "mt-1 text-center text-xs";

  if (endedEarly) {
    return (
      <p className={`${line} text-breath-ink/55`}>
        Day {journey.day} counts when you reach the end of it.
      </p>
    );
  }
  if (note === null) {
    return (
      <p className={`${line} text-breath-ink/55`}>
        {journey.name} · day {journey.day} of {journey.dayCount}
      </p>
    );
  }
  if (!note.ok) {
    return (
      <p role="alert" className={`${line} text-danger`}>
        This day could not be counted. It will count next time you finish it.
      </p>
    );
  }

  const { daysCompleted, dayCount, advanced } = note.result;
  if (!advanced) {
    return (
      <p className={`${line} text-breath-ink/55`}>
        Day {daysCompleted} of {dayCount} · already counted today
      </p>
    );
  }
  const left = dayCount - daysCompleted;
  return (
    <p className={`${line} text-breath`}>
      {left === 0
        ? `That is the whole course. ${dayCount} days.`
        : `Day ${daysCompleted} of ${dayCount} · ${left} to go`}
    </p>
  );
}

function SaveLine({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status.state === "saving") {
    return <p className="mt-4 text-center text-xs text-breath-ink/60">Saving…</p>;
  }
  if (status.state === "saved") {
    return <p className="mt-4 text-center text-xs text-breath-ink/60">Saved to your history.</p>;
  }
  if (status.state === "error") {
    return (
      <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        <p>This practice has not been saved. {status.error}</p>
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }
  return null;
}
