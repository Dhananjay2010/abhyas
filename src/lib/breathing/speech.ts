/**
 * The phone speaking each cue, through the Web Speech API.
 *
 * Nothing is recorded or downloaded: the voice is whatever the device already
 * has. That is the whole reason this is cheap, and also why it has to be
 * honest about what it finds -- `speechReport()` says what this phone actually
 * offers, and the screens show it rather than promising a voice that isn't
 * there.
 *
 * What real devices do, which no desktop check can prove:
 *  - **iOS only speaks from inside a tap.** An utterance started from a timer
 *    is dropped silently, so `warmUpSpeech()` runs in the same tap that starts
 *    the practice, and again on Resume.
 *  - **Safari often returns an empty voice list**, so a language cannot always
 *    be chosen; the system picks. We ask for the language on the utterance
 *    anyway, which is all we can do.
 *  - Other browsers fill the list asynchronously, hence `voiceschanged`.
 *  - iOS can stop speaking after the app has been in the background. The
 *    practice pauses when hidden, and resuming warms it up again.
 */
import type { TimedPhase } from "./engine";

export type VoiceLang = "en" | "hi";

export type SpeechReport = {
  supported: boolean;
  /** How many voices this device will admit to. Safari often says none. */
  voices: number;
  /** Whether a voice for the chosen language was found. */
  hasLanguage: boolean;
  /** The voice that would be used, when the device lets us choose. */
  chosen: string | null;
};

const LANG_TAG: Record<VoiceLang, string> = { en: "en-IN", hi: "hi-IN" };
/** en-IN first, then any English. Hindi has no such fallback. */
const LANG_PREFIX: Record<VoiceLang, string[]> = { en: ["en-in", "en"], hi: ["hi"] };

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/**
 * Development only: every cue this asked the device to say, readable as
 * `__breathSpeech`, with whether the utterance actually started and what went
 * wrong if it did not.
 *
 * Speech is the one part of the practice with no way to observe itself --
 * `speaking` is only true while a word is in the air, so sampling it proves
 * nothing. This does, and it is the diagnostic that would show an iPhone
 * dropping cues after the app has been in the background.
 */
export type SpeechRecord = {
  at: number;
  text: string;
  lang: VoiceLang;
  warm?: boolean;
  started?: boolean;
  ended?: boolean;
  error?: string;
};

function record(entry: SpeechRecord): SpeechRecord | null {
  if (process.env.NODE_ENV !== "development") return null;
  const g = globalThis as typeof globalThis & { __breathSpeech?: SpeechRecord[] };
  (g.__breathSpeech ??= []).push(entry);
  return entry;
}

function watch(utterance: SpeechSynthesisUtterance, entry: SpeechRecord | null) {
  if (!entry) return;
  utterance.onstart = () => {
    entry.started = true;
  };
  utterance.onend = () => {
    entry.ended = true;
  };
  utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
    entry.error = e.error || "error";
  };
}

export const speechSupported = (): boolean =>
  synth() !== null && typeof window.SpeechSynthesisUtterance === "function";

function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices();
  for (const prefix of LANG_PREFIX[lang]) {
    const match = voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
    if (match) return match;
  }
  return null;
}

export function speechReport(lang: VoiceLang): SpeechReport {
  const s = synth();
  if (!s || !speechSupported()) {
    return { supported: false, voices: 0, hasLanguage: false, chosen: null };
  }
  const voices = s.getVoices();
  const chosen = pickVoice(lang);
  return {
    supported: true,
    voices: voices.length,
    // An empty list is Safari refusing to enumerate, not a missing language:
    // it will still try, so this is not reported as "no voice".
    hasLanguage: voices.length === 0 || chosen !== null,
    chosen: chosen?.name ?? null,
  };
}

/** Some browsers fill the voice list after load; React subscribes to this. */
export function onVoicesChanged(callback: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", callback);
  return () => s.removeEventListener("voiceschanged", callback);
}

/**
 * Must run inside a tap. It speaks one silent utterance, which is what iOS
 * counts as permission for everything spoken afterwards.
 */
export function warmUpSpeech(lang: VoiceLang): void {
  const s = synth();
  if (!s || !speechSupported()) return;
  try {
    s.cancel();
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    warm.lang = LANG_TAG[lang];
    watch(warm, record({ at: Date.now(), text: "(warm-up)", lang, warm: true }));
    s.speak(warm);
  } catch {
    // Nothing to do: the cues simply will not be spoken.
  }
}

export function speak(text: string, lang: VoiceLang): void {
  const s = synth();
  if (!s || !speechSupported() || !text) return;
  try {
    // One cue at a time. A queue would still be saying "breathe in" as you
    // breathe out.
    s.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_TAG[lang];
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    utterance.pitch = 0.95;
    watch(utterance, record({ at: Date.now(), text, lang }));
    s.speak(utterance);
  } catch {
    // Ignore: sound is never the only channel, the words are on screen too.
  }
}

export function stopSpeech(): void {
  try {
    synth()?.cancel();
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// What to say
//
// Short, and in the right language: the screen's cue is a full sentence
// ("Breathe in through your nose"), which is too long to say inside a
// four-second breath.
// ---------------------------------------------------------------------------

const EN = {
  inhale: "Breathe in",
  inhaleLeft: "In through the left",
  inhaleRight: "In through the right",
  sniff: "Sniff",
  hold: "Hold",
  exhale: "Breathe out",
  exhaleLeft: "Out through the left",
  exhaleRight: "Out through the right",
  hum: "Hum",
  pump: "Pumping. Sharp out through the nose",
  rest: "Rest. Breathe normally",
  settle: "Settle in",
  done: "That was the last breath",
};

const HI = {
  inhale: "साँस लीजिए",
  inhaleLeft: "बाएँ नथुने से साँस लीजिए",
  inhaleRight: "दाएँ नथुने से साँस लीजिए",
  sniff: "थोड़ी और",
  hold: "रोकिए",
  exhale: "साँस छोड़िए",
  exhaleLeft: "बाएँ नथुने से छोड़िए",
  exhaleRight: "दाएँ नथुने से छोड़िए",
  hum: "गुनगुनाइए",
  pump: "अब कपालभाति। नाक से तेज़ी से छोड़िए",
  rest: "विश्राम। सामान्य साँस लीजिए",
  settle: "आराम से बैठिए",
  done: "यह आख़िरी साँस थी",
};

const words = (lang: VoiceLang) => (lang === "hi" ? HI : EN);

/** The spoken form of a phase: short, sided where the practice has sides. */
export function spokenCue(phase: TimedPhase, lang: VoiceLang, previousWasInhale = false): string {
  const w = words(lang);
  // Pumping and resting are said once, at the start of the phase. The voice
  // cannot count at one a second, so the knocks keep the tempo instead.
  if (phase.kind === "pump") return w.pump;
  if (phase.kind === "rest") return w.rest;
  if (phase.kind === "hold") return w.hold;
  if (phase.kind === "exhale") {
    if (phase.hum) return w.hum;
    if (phase.side === "left") return w.exhaleLeft;
    if (phase.side === "right") return w.exhaleRight;
    return w.exhale;
  }
  // A second inhale in a row is the sigh's top-up sniff, not a new breath.
  if (previousWasInhale) return w.sniff;
  if (phase.side === "left") return w.inhaleLeft;
  if (phase.side === "right") return w.inhaleRight;
  return w.inhale;
}

export const settleCue = (lang: VoiceLang) => words(lang).settle;
export const doneCue = (lang: VoiceLang) => words(lang).done;
