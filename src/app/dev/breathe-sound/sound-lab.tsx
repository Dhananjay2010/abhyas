"use client";

import { useEffect, useState } from "react";
import {
  BELL_HIGH,
  BELL_LOW,
  breathAudio,
  scheduleBell,
  scheduleGlide,
  sizeToHz,
  unlockBreathAudio,
} from "@/lib/breathing/audio";

/**
 * Renders the practice's real tones with an OfflineAudioContext -- the
 * browser's own Web Audio engine, not a model of it -- and measures the
 * result: that there is sound, that it rises on the inhale and falls on the
 * exhale, that it fades in and out without clicks, that the bells decay and
 * that stopping a tone silences it. The Play button is for ears.
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

/** Fundamental by autocorrelation, searched between 170 and 650 Hz. */
function pitch(d: Float32Array, from: number, to: number): number {
  const a = Math.floor(from * SR);
  const n = Math.floor((to - from) * SR);
  const minLag = Math.floor(SR / 650);
  const maxLag = Math.floor(SR / 170);
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

async function analyse(): Promise<Check[]> {
  // The real sequence of one box-breathing cycle, scaled to 4-second phases.
  const ctx = new OfflineAudioContext(1, SR * 12, SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  scheduleGlide(ctx, out, { at: 0.5, duration: 4, fromSize: 0, toSize: 1 });
  scheduleBell(ctx, out, { at: 4.5, hz: BELL_HIGH, peak: 0.05, decay: 1.4 });
  scheduleGlide(ctx, out, { at: 6, duration: 4, fromSize: 1, toSize: 0 });
  scheduleBell(ctx, out, { at: 10.2, hz: BELL_LOW, peak: 0.05, decay: 1.4 });
  const d = (await ctx.startRendering()).getChannelData(0);

  // A tone stopped half-way, as a pause does.
  const stopCtx = new OfflineAudioContext(1, SR * 3, SR);
  const voice = scheduleGlide(stopCtx, stopCtx.destination, { at: 0, duration: 2.5, fromSize: 0, toSize: 1 });
  voice.stop(1);
  const s = (await stopCtx.startRendering()).getChannelData(0);

  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  let jump = 0;
  for (let i = 1; i < d.length; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]));

  const inEarly = pitch(d, 0.9, 1.1);
  const inLate = pitch(d, 3.8, 4.0);
  const outEarly = pitch(d, 6.4, 6.6);
  const outLate = pitch(d, 9.3, 9.5);
  const f = (n: number) => `${n.toFixed(0)} Hz`;
  const r = (n: number) => n.toFixed(4);

  return [
    { label: "There is sound", detail: `peak ${peak.toFixed(3)}`, ok: peak > 0.02 },
    { label: "It never clips", detail: `peak ${peak.toFixed(3)} (limit 1.0)`, ok: peak < 1 },
    { label: "No clicks (largest sample-to-sample jump)", detail: jump.toFixed(4), ok: jump < 0.05 },
    { label: "Inhale rises in pitch", detail: `${f(inEarly)} → ${f(inLate)}`, ok: inLate > inEarly + 30 },
    { label: "Exhale falls in pitch", detail: `${f(outEarly)} → ${f(outLate)}`, ok: outLate < outEarly - 30 },
    {
      label: "Pitch stays in the G3–D4 band",
      detail: `${f(sizeToHz(0))}–${f(sizeToHz(1))} expected`,
      ok: [inEarly, inLate, outEarly, outLate].every((p) => p > 180 && p < 310),
    },
    {
      label: "Fades in rather than starting hard",
      detail: `${r(rms(d, 0.5, 0.55))} at onset vs ${r(rms(d, 2, 2.5))} in the middle`,
      ok: rms(d, 0.5, 0.55) < rms(d, 2, 2.5) * 0.6,
    },
    {
      label: "Silent between the inhale and the bell",
      detail: r(rms(d, 4.49, 4.5)),
      ok: rms(d, 4.49, 4.5) < 0.005,
    },
    {
      label: "The bell rings, then decays",
      detail: `${r(rms(d, 4.52, 4.62))} → ${r(rms(d, 5.6, 5.8))}`,
      ok: rms(d, 4.52, 4.62) > 0.01 && rms(d, 5.6, 5.8) < rms(d, 4.52, 4.62) * 0.3,
    },
    { label: "Silent after the last bell", detail: r(rms(d, 11.8, 12)), ok: rms(d, 11.8, 12) < 0.002 },
    {
      label: "Stopping a tone silences it (a pause)",
      detail: `${r(rms(s, 0.7, 0.9))} before → ${r(rms(s, 1.3, 1.6))} after`,
      ok: rms(s, 0.7, 0.9) > 0.02 && rms(s, 1.3, 1.6) < 0.002,
    },
  ];
}

export function SoundLab() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyse().then(setChecks, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const play = () => {
    const ctx = unlockBreathAudio();
    const audio = breathAudio();
    if (!ctx || !audio) return setError("This browser cannot play Web Audio.");
    const t = audio.ctx.currentTime + 0.1;
    scheduleGlide(audio.ctx, audio.out, { at: t, duration: 4, fromSize: 0, toSize: 1 });
    scheduleBell(audio.ctx, audio.out, { at: t + 4, hz: BELL_HIGH, peak: 0.05, decay: 1.4 });
    scheduleGlide(audio.ctx, audio.out, { at: t + 8, duration: 4, fromSize: 1, toSize: 0 });
    scheduleBell(audio.ctx, audio.out, { at: t + 12, hz: BELL_LOW, peak: 0.05, decay: 1.4 });
  };

  const passed = checks?.filter((c) => c.ok).length ?? 0;

  return (
    <div>
      <p className="text-sm text-muted">
        One cycle of box breathing, rendered offline by this browser and measured.
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
      <button
        type="button"
        onClick={play}
        className="mt-6 w-full rounded-xl bg-accent px-6 py-4 font-semibold text-accent-fg"
      >
        Play one cycle (in, hold, out, hold)
      </button>
    </div>
  );
}
