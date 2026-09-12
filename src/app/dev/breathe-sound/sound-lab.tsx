"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BELL_HIGH,
  BELL_LOW,
  breathAudio,
  scheduleBell,
  scheduleGlide,
  scheduleHum,
  scheduleSwell,
  sizeToHz,
  startAmbience,
  unlockBreathAudio,
  type Ambience,
  type AmbienceHandle,
} from "@/lib/breathing/audio";
import { AMBIENCE_OPTIONS } from "@/lib/breathing/pattern";
import {
  onVoicesChanged,
  speak,
  speechReport,
  warmUpSpeech,
  type SpeechReport,
} from "@/lib/breathing/speech";

/** What the server has to assume, since only the device knows its voices. */
const UNKNOWN_VOICES: SpeechReport = {
  supported: true,
  voices: 0,
  hasLanguage: true,
  chosen: null,
};

/**
 * Every sound the practice can make, rendered by this browser's own Web Audio
 * engine and measured -- and then playable, because measurements cannot tell
 * you whether something is pleasant.
 *
 * The voice section reports what this particular device offers, which is the
 * only way to know: Safari often will not even list its voices, and Hindi is
 * there only if the phone has it installed.
 */

const SR = 44100;
type Check = { label: string; detail: string; ok: boolean };

function rms(d: Float32Array, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * SR));
  const b = Math.min(d.length, Math.floor(to * SR));
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

function peakOf(d: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  return peak;
}

/**
 * Fundamental by autocorrelation, searched inside a given band.
 *
 * The band matters: the breathing tone carries a partial an octave below its
 * fundamental, so a search that reaches low enough locks onto that instead and
 * reports half the pitch. Each sound is therefore searched where its
 * fundamental actually lives.
 */
function pitch(d: Float32Array, from: number, to: number, lowHz = 170, highHz = 650): number {
  const a = Math.floor(from * SR);
  const n = Math.floor((to - from) * SR);
  const minLag = Math.floor(SR / highHz);
  const maxLag = Math.floor(SR / lowHz);
  let best = 0;
  let bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n - lag; i++) c += d[a + i] * d[a + i + lag];
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return SR / bestLag;
}

const r = (n: number) => n.toFixed(4);
const f = (n: number) => `${n.toFixed(0)} Hz`;

async function render(seconds: number, build: (ctx: OfflineAudioContext, out: GainNode) => void) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  build(ctx, out);
  return (await ctx.startRendering()).getChannelData(0);
}

async function analyse(): Promise<Check[]> {
  // ---- tones: one cycle of box breathing ----------------------------------
  const tones = await render(12, (ctx, out) => {
    scheduleGlide(ctx, out, { at: 0.5, duration: 4, fromSize: 0, toSize: 1 });
    scheduleBell(ctx, out, { at: 4.5, hz: BELL_HIGH, peak: 0.05, decay: 1.4 });
    scheduleGlide(ctx, out, { at: 6, duration: 4, fromSize: 1, toSize: 0 });
    scheduleBell(ctx, out, { at: 10.2, hz: BELL_LOW, peak: 0.05, decay: 1.4 });
  });

  // A tone stopped half-way, as a pause does.
  const stopped = await render(3, (ctx, out) => {
    scheduleGlide(ctx, out, { at: 0, duration: 2.5, fromSize: 0, toSize: 1 }).stop(1);
  });

  // ---- ocean: in, hold, out ------------------------------------------------
  const ocean = await render(11, (ctx, out) => {
    scheduleSwell(ctx, out, { at: 0, duration: 4, fromSize: 0, toSize: 1 });
    scheduleSwell(ctx, out, { at: 4, duration: 2, fromSize: 1, toSize: 1 });
    scheduleSwell(ctx, out, { at: 6, duration: 4, fromSize: 1, toSize: 0 });
  });

  // ---- the hum that Bhramari's exhale gets --------------------------------
  const hum = await render(5, (ctx, out) => {
    scheduleHum(ctx, out, { at: 0.2, duration: 4 });
  });

  // ---- the beds ------------------------------------------------------------
  const beds: Record<string, Float32Array> = {};
  for (const kind of ["rain", "waves", "brown", "tanpura"] as const) {
    beds[kind] = await render(8, (ctx, out) => {
      startAmbience(ctx, out, kind, 100, 0);
    });
  }

  const tonesPeak = peakOf(tones);
  let jump = 0;
  for (let i = 1; i < tones.length; i++) jump = Math.max(jump, Math.abs(tones[i] - tones[i - 1]));

  const inEarly = pitch(tones, 0.9, 1.1);
  const inLate = pitch(tones, 3.8, 4.0);
  const outEarly = pitch(tones, 6.4, 6.6);
  const outLate = pitch(tones, 9.3, 9.5);

  const oceanIn = [rms(ocean, 0.3, 0.6), rms(ocean, 1.8, 2.1), rms(ocean, 3.5, 3.8)];
  const oceanHold = [rms(ocean, 4.3, 4.6), rms(ocean, 5.5, 5.8)];
  const oceanOut = [rms(ocean, 6.3, 6.6), rms(ocean, 9.4, 9.7)];

  const bedLevel = (k: string) => rms(beds[k], 4, 7);
  const wavesEarly = rms(beds.waves, 3, 3.5);
  const wavesLate = rms(beds.waves, 6.5, 7);

  return [
    { label: "Tones: there is sound, and it never clips", detail: `peak ${tonesPeak.toFixed(3)}`, ok: tonesPeak > 0.02 && tonesPeak < 1 },
    { label: "Tones: no clicks", detail: jump.toFixed(4), ok: jump < 0.05 },
    { label: "Tones: the inhale rises", detail: `${f(inEarly)} → ${f(inLate)}`, ok: inLate > inEarly + 30 },
    { label: "Tones: the exhale falls", detail: `${f(outEarly)} → ${f(outLate)}`, ok: outLate < outEarly - 30 },
    {
      label: "Tones: stays in the G3–D4 band",
      detail: `${f(sizeToHz(0))}–${f(sizeToHz(1))} expected`,
      ok: [inEarly, inLate, outEarly, outLate].every((p) => p > 180 && p < 310),
    },
    { label: "Tones: silent between cues", detail: r(rms(tones, 4.49, 4.5)), ok: rms(tones, 4.49, 4.5) < 0.005 },
    {
      label: "Tones: the bell rings, then decays",
      detail: `${r(rms(tones, 4.52, 4.62))} → ${r(rms(tones, 5.6, 5.8))}`,
      ok: rms(tones, 4.52, 4.62) > 0.01 && rms(tones, 5.6, 5.8) < rms(tones, 4.52, 4.62) * 0.3,
    },
    {
      label: "Tones: stopping one silences it (a pause)",
      detail: `${r(rms(stopped, 0.7, 0.9))} → ${r(rms(stopped, 1.3, 1.6))}`,
      ok: rms(stopped, 0.7, 0.9) > 0.02 && rms(stopped, 1.3, 1.6) < 0.002,
    },

    {
      label: "Ocean: the wave swells through the inhale",
      detail: oceanIn.map(r).join(" → "),
      ok: oceanIn[1] > oceanIn[0] * 1.5 && oceanIn[2] > oceanIn[1],
    },
    {
      label: "Ocean: it holds its level through a hold",
      detail: oceanHold.map(r).join(" → "),
      ok: Math.abs(oceanHold[1] - oceanHold[0]) < oceanHold[0] * 0.25,
    },
    {
      label: "Ocean: it ebbs through the exhale",
      detail: oceanOut.map(r).join(" → "),
      ok: oceanOut[1] < oceanOut[0] * 0.5,
    },
    { label: "Ocean: never clips", detail: `peak ${peakOf(ocean).toFixed(3)}`, ok: peakOf(ocean) < 1 },

    {
      label: "Hum: sounds, at about F3, and fades out",
      detail: `${f(pitch(hum, 1, 1.3, 120, 400))}, ${r(rms(hum, 1, 2))} → ${r(rms(hum, 4.3, 4.6))}`,
      ok:
        rms(hum, 1, 2) > 0.01 &&
        pitch(hum, 1, 1.3, 120, 400) > 150 &&
        pitch(hum, 1, 1.3, 120, 400) < 200 &&
        rms(hum, 4.3, 4.6) < 0.005,
    },

    ...(["rain", "waves", "brown", "tanpura"] as const).map((kind) => ({
      label: `Bed: ${kind} plays, fades in and never clips`,
      detail: `${r(rms(beds[kind], 0, 0.2))} at the start → ${r(bedLevel(kind))} once up, peak ${peakOf(beds[kind]).toFixed(3)}`,
      ok: bedLevel(kind) > 0.005 && peakOf(beds[kind]) < 1 && rms(beds[kind], 0, 0.2) < bedLevel(kind) * 0.5,
    })),
    {
      label: "Bed: waves rise and fall on their own",
      detail: `${r(wavesEarly)} vs ${r(wavesLate)}`,
      ok: Math.abs(wavesEarly - wavesLate) > Math.min(wavesEarly, wavesLate) * 0.1,
    },
  ];
}

export function SoundLab() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Ambience>("none");
  const bed = useRef<AmbienceHandle | null>(null);

  // Read through the store, not during render: the server knows nothing about
  // this device's voices, and reading them straight would not match what the
  // server sent, which is a hydration mismatch.
  const reports = useSyncExternalStore(
    onVoicesChanged,
    () => JSON.stringify([speechReport("en"), speechReport("hi")]),
    () => JSON.stringify([UNKNOWN_VOICES, UNKNOWN_VOICES]),
  );
  const [en, hi] = JSON.parse(reports) as [SpeechReport, SpeechReport];

  useEffect(() => {
    analyse().then(setChecks, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => bed.current?.stop();
  }, []);

  const audioOrFail = () => {
    unlockBreathAudio();
    const audio = breathAudio();
    if (!audio) setError("This browser cannot play Web Audio.");
    return audio;
  };

  const playTones = () => {
    const audio = audioOrFail();
    if (!audio) return;
    const t = audio.ctx.currentTime + 0.1;
    scheduleGlide(audio.ctx, audio.out, { at: t, duration: 4, fromSize: 0, toSize: 1 });
    scheduleBell(audio.ctx, audio.out, { at: t + 4, hz: BELL_HIGH, peak: 0.05, decay: 1.4 });
    scheduleGlide(audio.ctx, audio.out, { at: t + 8, duration: 4, fromSize: 1, toSize: 0 });
    scheduleBell(audio.ctx, audio.out, { at: t + 12, hz: BELL_LOW, peak: 0.05, decay: 1.4 });
  };

  const playOcean = () => {
    const audio = audioOrFail();
    if (!audio) return;
    const t = audio.ctx.currentTime + 0.1;
    scheduleSwell(audio.ctx, audio.out, { at: t, duration: 4, fromSize: 0, toSize: 1 });
    scheduleSwell(audio.ctx, audio.out, { at: t + 4, duration: 4, fromSize: 1, toSize: 1 });
    scheduleSwell(audio.ctx, audio.out, { at: t + 8, duration: 4, fromSize: 1, toSize: 0 });
  };

  const playHum = () => {
    const audio = audioOrFail();
    if (!audio) return;
    scheduleHum(audio.ctx, audio.out, { at: audio.ctx.currentTime + 0.1, duration: 5 });
  };

  const toggleBed = (kind: Ambience) => {
    bed.current?.stop();
    bed.current = null;
    if (kind === "none" || kind === playing) {
      setPlaying("none");
      return;
    }
    const audio = audioOrFail();
    if (!audio) return;
    bed.current = startAmbience(audio.ctx, audio.out, kind, 70);
    setPlaying(kind);
  };

  const sayCue = (lang: "en" | "hi") => {
    warmUpSpeech(lang);
    speak(lang === "hi" ? "साँस लीजिए। रोकिए। साँस छोड़िए।" : "Breathe in. Hold. Breathe out.", lang);
  };

  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const button =
    "rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium transition-colors hover:border-breath/50";

  return (
    <div>
      <p className="text-sm text-muted">
        Every sound the practice makes, rendered offline by this browser and measured. Then
        play them, because a measurement cannot tell you whether it is pleasant.
      </p>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {checks && (
        <>
          <p data-testid="summary" className="mt-4 text-sm font-semibold">
            {passed} of {checks.length} checks passed
          </p>
          <ul className="mt-3 space-y-2">
            {checks.map((c) => (
              <li key={c.label} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                <span className={c.ok ? "text-success" : "text-danger"}>{c.ok ? "PASS" : "FAIL"}</span>{" "}
                {c.label}
                <span className="block text-xs text-muted tabular-nums">{c.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted uppercase">Listen</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={playTones} className={button}>
          Tones
        </button>
        <button type="button" onClick={playOcean} className={button}>
          Ocean
        </button>
        <button type="button" onClick={playHum} className={button}>
          Hum
        </button>
      </div>

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted uppercase">
        Background sounds
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AMBIENCE_OPTIONS.filter((a) => a.value !== "none").map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => toggleBed(a.value)}
            className={`${button} ${playing === a.value ? "border-breath text-breath" : ""}`}
          >
            {playing === a.value ? `Stop ${a.label}` : a.label}
          </button>
        ))}
      </div>

      <h2 className="mt-8 text-xs font-semibold tracking-wider text-muted uppercase">
        Voices on this device
      </h2>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Speech supported</dt>
          <dd>{en.supported ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Voices listed</dt>
          <dd className="tabular-nums">{en.voices}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">English</dt>
          <dd className="text-right">{en.chosen ?? (en.hasLanguage ? "the system picks" : "none found")}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Hindi</dt>
          <dd className="text-right">{hi.chosen ?? (hi.hasLanguage ? "the system picks" : "none found")}</dd>
        </div>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => sayCue("en")} className={button}>
          Say it in English
        </button>
        <button type="button" onClick={() => sayCue("hi")} className={button}>
          हिन्दी में सुनिए
        </button>
      </div>
    </div>
  );
}
