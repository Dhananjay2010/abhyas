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
  type Position,
  type Side,
  type TimedPhase,
} from "@/lib/breathing/engine";
import { MOODS, moodLabel, type Pattern, type SessionOptions } from "@/lib/breathing/pattern";
import { GLOW_BG, HALO_BG, ORB_BG, RING_C, RING_R, SESSION_BG } from "@/lib/breathing/theme";
import { formatClock, useWakeLock, vibrate } from "@/lib/session/device";
import { rateBreathingPractice, recordBreathingPractice } from "../../actions";
import { Icon, WeekStrip } from "../../controls";
import { usePrefersReducedMotion } from "../../use-media";

type Actions = {
  recordBreathingPractice: typeof recordBreathingPractice;
  rateBreathingPractice: typeof rateBreathingPractice;
};
const REAL: Actions = { recordBreathingPractice, rateBreathingPractice };

const SETTLE_SECONDS = 5;
const WIND_DOWN_SECONDS = 10;
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

type SessionProps = {
  pattern: Pattern;
  options: SessionOptions;
  /** This week before this visit: Monday..Sunday, and seconds breathed. */
  week: { days: boolean[]; seconds: number };
  /** 1..7, Monday first. */
  todayIndex: number;
  homeHref: string;
  actions?: Actions;
};

/**
 * The practice screen: full screen, no tab bar, and a back button that pauses.
 *
 * This outer part owns what must outlive one practice: the history entry that
 * turns "back" into "pause", how to leave, and the running total for the week.
 * "Again" remounts the inner practice from scratch with a new key.
 */
export function BreathingSession({ actions = REAL, ...props }: SessionProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [fromApp] = useState(() => openedFromApp());
  const leavingRef = useRef(false);
  const finishedRef = useRef(false);
  const pauseRef = useRef<() => void>(() => {});
  const { homeHref } = props;

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
  const onAgain = useCallback(() => setAttempt((a) => a + 1), []);

  const todayIdx = props.todayIndex - 1;
  const week = {
    days: props.week.days.map((d, i) => d || (savedSeconds > 0 && i === todayIdx)),
    seconds: props.week.seconds + savedSeconds,
  };

  return (
    <Practice
      key={attempt}
      {...props}
      week={week}
      actions={actions}
      registerPause={registerPause}
      onFinished={onFinished}
      onSaved={onSaved}
      onAgain={onAgain}
      onLeave={leave}
    />
  );
}

type Stage = "checkin" | "running" | "finished";
type Sub = "settle" | "practice" | "winddown";
type Outcome = { cycles: number; seconds: number; breaths: number; endedEarly: boolean };
type Status = { state: "idle" | "saving" | "saved" | "error"; error?: string };
type View = { sub: Sub; phase: TimedPhase; cycleIndex: number };

type PracticeProps = Omit<SessionProps, "actions" | "homeHref"> & {
  actions: Actions;
  registerPause: (fn: () => void) => void;
  onFinished: (finished: boolean) => void;
  onSaved: (seconds: number) => void;
  onAgain: () => void;
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
  registerPause,
  onFinished,
  onSaved,
  onAgain,
  onLeave,
}: PracticeProps) {
  const cycle = useMemo(() => buildCycle(pattern.phases), [pattern.phases]);
  const total = cycle.seconds * options.cycles;
  const settle = options.settleIn ? SETTLE_SECONDS : 0;
  const hasSides = cycle.phases.some((p) => p.side !== null);
  const reduced = usePrefersReducedMotion();
  // The server cannot know either of these. Rendering as "can play, no
  // context yet" there means a cold load asks for a tap, and a practice opened
  // from Start -- whose tap already unlocked sound -- does not.
  const canPlay = useSyncExternalStore(noSubscribe, audioSupported, () => true);
  const hasContext = useSyncExternalStore(noSubscribe, () => breathAudio() !== null, () => false);

  const [logId] = useState(() => uuid());
  const [clock] = useState(() => new PausableClock());
  const [stage, setStage] = useState<Stage>(options.checkIn === "both" ? "checkin" : "running");
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

  // Voice falls back to tones on a browser that cannot speak, and says so.
  const canSpeak = useSyncExternalStore(onVoicesChanged, speechSupported, () => true);
  const wantsVoice = options.guidance === "voice";
  /** What is actually playing. Turning sound back on after choosing "off" gives tones. */
  const mode: "tones" | "ocean" | "voice" =
    wantsVoice && canSpeak ? "voice" : options.guidance === "ocean" ? "ocean" : "tones";

  const needsTap = stage === "running" && soundOn && canPlay && !hasContext && !tapped;
  const live = stage === "running" && !paused && !needsTap;
  useWakeLock(live);

  const orbRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
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
        })
        .then(
          (r) => {
            if (!r.ok) {
              setSave({ state: "error", error: r.error });
              return;
            }
            setSave({ state: "saved" });
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

    const paint = (size: number, ring: number, overall: number) => {
      const orb = orbRef.current;
      if (orb) {
        if (reduced) {
          // The same information without the zoom: the orb brightens and dims.
          orb.style.transform = "scale(0.8)";
          orb.style.opacity = String(0.4 + 0.6 * size);
        } else {
          orb.style.transform = `scale(${0.42 + 0.58 * size})`;
          orb.style.opacity = "1";
        }
      }
      const glow = glowRef.current;
      if (glow) {
        glow.style.opacity = String(0.15 + 0.55 * size);
        if (!reduced) glow.style.transform = `scale(${0.62 + 0.5 * size})`;
      }
      if (haloRef.current) haloRef.current.style.opacity = String(0.25 + 0.75 * size);
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - ring));
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, overall))})`;
      }
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
        paint(0, 0, 0);
        sound(t, null);
      } else if (t < total) {
        const pos = positionAt(cycle, options.cycles, t);
        const key = `${pos.cycleIndex}:${pos.phase.index}`;
        if (key !== keyRef.current) {
          keyRef.current = key;
          setView({ sub: "practice", phase: pos.phase, cycleIndex: pos.cycleIndex });
          setAnnounce(`${pos.phase.cue}. ${Math.round(pos.phase.seconds)} seconds.`);
          // Speech cannot be put on the audio clock, so it is said as the
          // phase turns -- within a frame of the sound the other modes make.
          if (soundOnRef.current && modeRef.current === "voice") {
            const before = cycle.phases[(pos.phase.index - 1 + cycle.phases.length) % cycle.phases.length];
            speak(spokenCue(pos.phase, options.voiceLang, before.kind === "inhale"), options.voiceLang);
          }
          if (options.vibrate) {
            vibrate(pos.phase.kind === "inhale" ? 60 : pos.phase.kind === "exhale" ? [30, 40, 30] : 20);
          }
        }
        const c = options.showCount ? Math.max(1, Math.ceil(pos.phaseRemaining - 1e-6)) : null;
        if (c !== countRef.current) {
          countRef.current = c;
          setCount(c);
        }
        const left = Math.max(0, Math.ceil(total - t - 1e-6));
        if (left !== leftRef.current) {
          leftRef.current = left;
          setSecondsLeft(left);
        }
        paint(pos.size, pos.progress, t / total);
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
        if (t >= total + WIND_DOWN_SECONDS) {
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
        paint(0, 0, 1);
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

  if (stage === "finished" && outcome) {
    const weekMinutes =
      week.seconds === 0 ? "0 min" : week.seconds < 60 ? "Under a minute" : `${Math.round(week.seconds / 60)} min`;
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
          <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight">
            {outcome.endedEarly ? "Every breath counts." : "Nicely done."}
          </h1>
          <p className="mt-2 text-center text-sm text-breath-ink/70">
            {formatClock(outcome.seconds)} · {outcome.breaths} {outcome.breaths === 1 ? "breath" : "breaths"} ·{" "}
            {pattern.name}
          </p>

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
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-breath-ink/10">
          <div
            ref={barRef}
            className="h-full origin-left rounded-full bg-breath"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
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
          <div
            ref={orbRef}
            aria-hidden="true"
            className="rounded-full"
            style={{
              width: "76%",
              height: "76%",
              background: ORB_BG,
              boxShadow: "0 0 70px 6px rgba(111, 216, 210, 0.22), inset -18px -24px 60px rgba(8, 40, 60, 0.35)",
              transform: reduced ? "scale(0.8)" : "scale(0.42)",
              opacity: reduced ? 0.4 : 1,
            }}
          />
          <svg aria-hidden="true" viewBox="0 0 300 300" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="150" cy="150" r={RING_R} fill="none" stroke="rgba(220, 243, 241, 0.1)" strokeWidth="2.5" />
            <circle
              ref={ringRef}
              cx="150"
              cy="150"
              r={RING_R}
              fill="none"
              stroke="#6fd8d2"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C}
            />
          </svg>
        </div>

        <div className="mt-[min(1.75rem,3dvh)] min-h-24 max-w-sm shrink-0 text-center">
          <p key={cueKey} className="breath-fade text-[1.7rem] leading-tight font-semibold tracking-tight">
            {cue}
          </p>
          {aside && <p className="mt-2 text-sm leading-relaxed text-breath-ink/65">{aside}</p>}
          {count !== null && (
            <p aria-hidden="true" className="mt-2 text-lg tabular-nums text-breath-ink/55">
              {count}
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
              onClick={(e) => {
                e.stopPropagation();
                requestPause();
              }}
              className={`h-12 w-12 text-sm text-breath-ink/80 ${fade}`}
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
