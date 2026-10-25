"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unlockBreathAudio } from "@/lib/breathing/audio";
import { noteInAppStart } from "@/lib/breathing/client";
import type { ResolvedDay, ResolvedJourney } from "@/lib/breathing/journey";
import { sessionSearch, type BreathingPrefs } from "@/lib/breathing/pattern";
import { warmUpSpeech } from "@/lib/breathing/speech";
import type { PrefsPatch } from "@/lib/breathing/validation";
import { updateBreathingPrefs } from "../../actions";
import { Choice, Field, Icon } from "../../controls";
import { RhythmPreview } from "../../rhythm-preview";
import { SoundControls } from "../../sound-controls";

type Actions = { updateBreathingPrefs: typeof updateBreathingPrefs };
const REAL: Actions = { updateBreathingPrefs };

/** A tick for a day that is done, its number for one that is not. */
function DayMark({ day }: { day: ResolvedDay }) {
  const done = day.state === "done";
  const open = day.state === "today";
  return (
    <span
      aria-hidden="true"
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${
        done
          ? "border-breath bg-breath/20 text-breath"
          : open
            ? "border-breath text-breath"
            : "border-border text-muted"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 10.5 8 14.5 16 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        day.number
      )}
    </span>
  );
}

/**
 * A course: what each day teaches, which of them are done, and the one that is
 * open now.
 *
 * Every day is shown, including the ones ahead, because the reason to do a
 * course rather than pick a practice is that someone decided the order and can
 * say why. Hiding what is coming would take that away.
 */
export function JourneyView({
  resolved,
  prefs,
  firstPractice,
  basePath = "/breathe",
  actions = REAL,
}: {
  resolved: ResolvedJourney;
  prefs: BreathingPrefs;
  firstPractice: boolean;
  basePath?: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const { journey, days, progress, today } = resolved;

  const [sound, setSound] = useState({
    guidance: prefs.guidance,
    ambience: prefs.ambience,
    ambienceVolume: prefs.ambienceVolume,
    voiceLang: prefs.voiceLang,
  });
  const [showCount, setShowCount] = useState(prefs.showCount);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [, startTransition] = useTransition();

  const remember = (patch: PrefsPatch) =>
    startTransition(async () => {
      const r = await actions.updateBreathingPrefs(patch);
      setPrefError(r.ok ? null : r.error);
    });

  const start = () => {
    if (!today || starting) return;
    setStarting(true);
    // The gesture iOS needs before any sound: Web Audio and speech are granted
    // separately, and what this unlocks survives the navigation.
    if (sound.guidance !== "off") {
      unlockBreathAudio();
      if (sound.guidance === "voice") warmUpSpeech(sound.voiceLang);
    }
    noteInAppStart();
    router.push(
      `${basePath}/journey/${journey.slug}/session${sessionSearch({
        // The day sets its own length, so the player replaces this.
        cycles: today.cycles,
        ...sound,
        showCount,
        vibrate: prefs.vibrate,
        settleIn: prefs.settleIn,
        checkIn: prefs.checkIn,
      })}&day=${today.number}`,
    );
  };

  const next = days.find((d) => d.state === "tomorrow");
  const done = progress.daysCompleted;

  return (
    <>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon.Back /> Breathe
      </Link>

      <section className="mt-6 text-center">
        <p className="text-[11px] font-semibold tracking-wider text-breath uppercase">Course</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{journey.name}</h1>
        {journey.subtitle && <p className="mt-1 text-muted">{journey.subtitle}</p>}
        <p className="mt-4 text-sm leading-relaxed text-breath">{journey.description}</p>
      </section>

      {/* One mark a day, so where you are is readable before anything is read. */}
      <div aria-hidden="true" className="mt-6 flex justify-center gap-1.5">
        {days.map((d) => (
          <span
            key={d.number}
            className={`h-1.5 flex-1 rounded-full ${
              d.state === "done" ? "bg-breath" : d.state === "today" ? "bg-breath/40" : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        {progress.completed
          ? `All ${days.length} days done`
          : done === 0
            ? `${days.length} days · not started`
            : `${done} of ${days.length} days done`}
      </p>

      <ol className="mt-7 space-y-2">
        {days.map((day) => {
          const open = day.state === "today";
          return (
            <li
              key={day.number}
              className={`rounded-2xl border px-4 py-3.5 ${
                open
                  ? "border-breath/50 bg-breath/[0.06]"
                  : day.state === "done"
                    ? "border-border bg-surface"
                    : "border-border bg-surface opacity-70"
              }`}
            >
              <div className="flex items-center gap-3">
                <DayMark day={day} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{day.day.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{day.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-breath">
                    Day {day.number} · {day.pattern.name}
                  </p>
                </div>
                <RhythmPreview phases={day.pattern.phases} shape={day.pattern.shape} size={40} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{day.day.teaches}</p>
              {day.chosenBecause && (
                <p className="mt-1 text-xs text-breath">{day.chosenBecause}</p>
              )}
              {day.day.pick === "best" && !day.chosenBecause && (
                <p className="mt-1 text-xs text-muted">
                  Rate a few practices and this becomes whichever one leaves you calmest. Until
                  then it is {day.pattern.name}.
                </p>
              )}
              {open && day.pattern.contraindications && (
                <div
                  role="note"
                  className="mt-3 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
                >
                  <Icon.Caution className="mt-0.5 shrink-0 text-amber-300" />
                  <p>{day.pattern.contraindications}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {firstPractice && (
        <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          Breathe sitting or lying down, never while driving or in water. If you feel dizzy,
          tingly or short of breath, stop and breathe normally.
        </p>
      )}

      {today ? (
        <>
          <section className="mt-7 space-y-4">
            <h2 className="text-sm font-medium">Guidance</h2>
            <SoundControls
              prefs={sound}
              onChange={(patch) => {
                setSound((s) => ({ ...s, ...patch }));
                remember(patch);
              }}
            />
            <Field label="Seconds count">
              <Choice
                label="Seconds count"
                value={showCount}
                options={[
                  { value: true, label: "Show" },
                  { value: false, label: "Hide" },
                ]}
                onChange={(v) => {
                  setShowCount(v);
                  remember({ showCount: v });
                }}
              />
            </Field>
            {prefError && (
              <p role="alert" className="text-xs text-danger">
                {prefError}
              </p>
            )}
          </section>

          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="mt-8 w-full rounded-xl bg-accent px-6 py-5 text-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {starting ? "Starting…" : `Start day ${today.number}`}
          </button>
        </>
      ) : (
        // No day today: either the course is over, or today's is already done.
        // Both point back at the practices, because the course ending is not a
        // reason to stop breathing.
        <div className="mt-8 rounded-2xl border border-border bg-surface px-5 py-4 text-center">
          <p className="text-sm font-medium">
            {progress.completed
              ? "You have finished the course."
              : `Day ${next?.number ?? done + 1} opens tomorrow.`}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {progress.completed
              ? "Every practice in it is still on the Breathe tab, and the one that suited you best is day seven."
              : "One a day is the point of it. Anything on the Breathe tab is still there if you want to breathe now."}
          </p>
          <Link
            href={basePath}
            className="mt-3 inline-block text-sm font-semibold text-breath underline underline-offset-2"
          >
            Back to the practices
          </Link>
        </div>
      )}

      {journey.about && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            Why in this order
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{journey.about}</p>
        </section>
      )}
    </>
  );
}
