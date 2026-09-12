"use client";

import { useSyncExternalStore } from "react";
import { audioSupported, unlockBreathAudio } from "@/lib/breathing/audio";
import { isIOS } from "@/lib/breathing/client";
import {
  AMBIENCE_OPTIONS,
  GUIDANCE_OPTIONS,
  VOICE_LANGS,
  VOLUME_STEP,
  type BreathingPrefs,
} from "@/lib/breathing/pattern";
import { onVoicesChanged, speak, speechReport, warmUpSpeech } from "@/lib/breathing/speech";
import type { PrefsPatch } from "@/lib/breathing/validation";
import { Choice, Field } from "./controls";
import { useClientValue } from "./use-media";

/**
 * How a practice sounds: the guide, the bed underneath it and its volume.
 *
 * Shared by the setup screen and the preferences sheet, so the two can never
 * drift apart. Everything it says about the device -- whether this browser can
 * play sound at all, whether it can speak, whether it has a voice for the
 * chosen language -- is read from the device itself rather than assumed.
 */
export function SoundControls({
  prefs,
  onChange,
}: {
  prefs: Pick<BreathingPrefs, "guidance" | "ambience" | "ambienceVolume" | "voiceLang">;
  onChange: (patch: PrefsPatch) => void;
}) {
  const canPlay = useClientValue(audioSupported, true);
  const silentSwitchMutes = useClientValue(() => isIOS() && !("audioSession" in navigator), false);
  // Voices arrive asynchronously in most browsers, so this re-reads on the
  // `voiceschanged` event rather than once at mount.
  const voices = useSyncExternalStore(
    onVoicesChanged,
    () => JSON.stringify(speechReport(prefs.voiceLang)),
    () => JSON.stringify({ supported: true, voices: 0, hasLanguage: true, chosen: null }),
  );
  const speech = JSON.parse(voices) as ReturnType<typeof speechReport>;

  const guidanceHint = !canPlay
    ? "This browser cannot play sound."
    : [
        GUIDANCE_OPTIONS.find((g) => g.value === prefs.guidance)?.hint,
        prefs.guidance !== "off" && silentSwitchMutes
          ? "On this iPhone the silent switch mutes it."
          : null,
      ]
        .filter(Boolean)
        .join(" ");

  const tryVoice = () => {
    // The tap is what lets iOS speak at all, now and for the rest of the practice.
    warmUpSpeech(prefs.voiceLang);
    unlockBreathAudio();
    speak(prefs.voiceLang === "hi" ? "साँस लीजिए" : "Breathe in", prefs.voiceLang);
  };

  return (
    <>
      <Field label="Sound" hint={guidanceHint || null}>
        <Choice
          label="Sound"
          value={prefs.guidance}
          options={GUIDANCE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
          onChange={(g) => onChange({ guidance: g })}
        />
      </Field>

      {prefs.guidance === "voice" && (
        <Field
          label="Voice"
          hint={
            !speech.supported
              ? "This browser cannot speak. Tones will play instead."
              : speech.hasLanguage
                ? speech.chosen
                  ? `Using ${speech.chosen}.`
                  : "This browser will not name its voices, so it picks one for you."
                : prefs.voiceLang === "hi"
                  ? "No Hindi voice is installed on this device. Add one in the phone's settings, or use English."
                  : "No English voice was found on this device."
          }
        >
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Choice
                label="Voice language"
                value={prefs.voiceLang}
                options={VOICE_LANGS.map((l) => ({ value: l.value, label: l.label }))}
                onChange={(l) => onChange({ voiceLang: l })}
              />
            </div>
            <button
              type="button"
              onClick={tryVoice}
              className="min-h-10 shrink-0 rounded-xl border border-border px-4 text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              Hear it
            </button>
          </div>
        </Field>
      )}

      <Field label="Background sound" hint="Plays under the guide, at its own volume.">
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Background sound">
          {AMBIENCE_OPTIONS.map((a) => {
            const on = a.value === prefs.ambience;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ambience: a.value })}
                className={`min-h-10 flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                  on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </Field>

      {prefs.ambience !== "none" && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
          <button
            type="button"
            aria-label="Quieter"
            disabled={prefs.ambienceVolume <= 0}
            onClick={() =>
              onChange({ ambienceVolume: Math.max(0, prefs.ambienceVolume - VOLUME_STEP) })
            }
            className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-xl disabled:opacity-40"
          >
            −
          </button>
          <span aria-live="polite" className="text-sm font-medium tabular-nums">
            Volume {prefs.ambienceVolume}%
          </span>
          <button
            type="button"
            aria-label="Louder"
            disabled={prefs.ambienceVolume >= 100}
            onClick={() =>
              onChange({ ambienceVolume: Math.min(100, prefs.ambienceVolume + VOLUME_STEP) })
            }
            className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-xl disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </>
  );
}
