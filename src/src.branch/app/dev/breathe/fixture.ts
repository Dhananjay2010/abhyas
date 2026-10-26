import {
  DEFAULT_PREFS,
  withUserPatterns,
  type BreathingPrefs,
  type Pattern,
  type UserPattern,
} from "@/lib/breathing/pattern";
import { addDays } from "@/lib/dates";
import {
  resolveJourney,
  type Journey,
  type JourneyProgress,
  type ResolvedJourney,
} from "@/lib/breathing/journey";
import { resolveRoutine, type ResolvedRoutine, type Routine } from "@/lib/breathing/routine";
import type { CalmShift } from "@/lib/breathing/stats";

/** Everything a built-in pattern carries before your own rows are folded in. */
type Seed = Omit<Pattern, "kind" | "userPatternId" | "adjusted" | "defaultPhases">;

const builtIn = (seed: Seed): Pattern => ({
  ...seed,
  kind: "builtin",
  userPatternId: null,
  adjusted: false,
  defaultPhases: seed.phases,
});

/**
 * The seeded patterns, as the migrations write them, so the harness shows the
 * real content. Keep the two in step by hand.
 */
const SEEDS: Seed[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "box-breathing",
    shape: "square",
    name: "Box Breathing",
    subtitle: "Four equal sides",
    description: "Equal counts on all four phases. Inhale, hold, exhale, hold — a square.",
    benefit: "Focus and steady calm. Good before a heavy session.",
    contraindications: "Ease off the holds if you have high blood pressure or feel light-headed.",
    level: "beginner",
    intents: ["focus", "calm"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "Breathe in" },
      { kind: "hold", seconds: 4, cue: "Hold" },
      { kind: "exhale", seconds: 4, cue: "Breathe out" },
      { kind: "hold", seconds: 4, cue: "Hold" },
    ],
    maxCycles: null,
    defaultCycles: 10,
    howTo: [
      "Sit upright, feet flat, shoulders soft.",
      "Breathe in through your nose for four.",
      "Hold gently for four. There should be no strain in your throat.",
      "Breathe out for four, then rest empty for four.",
    ],
    why: "Slow, even counts bring your breathing rate down and give a busy mind one simple job. It is a favourite for staying composed before something demanding.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "four-seven-eight",
    shape: "teardrop",
    name: "4-7-8 Breathing",
    subtitle: "The long exhale, for sleep",
    description: "Inhale for 4, hold for 7, exhale slowly for 8. The long exhale is the point.",
    benefit: "Winding down and falling asleep.",
    contraindications: "Not while pregnant, or with low blood pressure. Start with four breaths. The app stops you at eight.",
    level: "beginner",
    intents: ["sleep", "calm"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "Breathe in through your nose" },
      { kind: "hold", seconds: 7, cue: "Hold" },
      { kind: "exhale", seconds: 8, cue: "Out through your mouth, whoosh" },
    ],
    maxCycles: 8,
    defaultCycles: 4,
    howTo: [
      "Rest the tip of your tongue on the ridge just behind your upper front teeth, and keep it there.",
      "Breathe in quietly through your nose for four.",
      "Hold for seven.",
      "Breathe out through your mouth for eight, with a soft whoosh.",
    ],
    why: "The exhale is twice as long as the inhale, and breathing out is the part of each breath that slows your heart. Four rounds is enough to feel it.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "coherent-breathing",
    shape: "orb",
    name: "Coherent Breathing",
    subtitle: "About five and a half breaths a minute",
    description: "Smooth, even breathing at about five and a half breaths a minute. No holds.",
    benefit: "Baseline calm and heart-rate variability. The safest daily default.",
    contraindications: null,
    level: "beginner",
    intents: ["calm", "balance"],
    phases: [
      { kind: "inhale", seconds: 5.5, cue: "Breathe in" },
      { kind: "exhale", seconds: 5.5, cue: "Breathe out" },
    ],
    maxCycles: null,
    defaultCycles: 30,
    howTo: [
      "Sit or lie down comfortably.",
      "Breathe in through your nose, smoothly, for the whole rise.",
      "Breathe out through your nose just as smoothly, with no pause at the top or bottom.",
      "Keep it gentle. It should feel easy, never like work.",
    ],
    why: "At around five and a half breaths a minute, your breathing and heart rhythm tend to fall into step, which goes with steadier, calmer heart-rate variability. It is the safest one to do every day.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    slug: "physiological-sigh",
    shape: "teardrop",
    name: "Physiological Sigh",
    subtitle: "Double inhale, long exhale",
    description: "A double inhale through the nose — one full, one short sniff on top — then a long exhale through the mouth.",
    benefit: "The fastest way down from acute stress. Works in under a minute.",
    contraindications: null,
    level: "beginner",
    intents: ["calm", "recover"],
    phases: [
      { kind: "inhale", seconds: 2, cue: "Breathe in through your nose", to: 0.8 },
      { kind: "inhale", seconds: 1, cue: "Sniff to top it up", label: "Sniff" },
      { kind: "exhale", seconds: 6, cue: "Long breath out through your mouth" },
    ],
    maxCycles: null,
    defaultCycles: 5,
    howTo: [
      "Breathe in through your nose until your lungs feel nearly full.",
      "Take one more short sniff on top to fill them completely.",
      "Let it all go slowly through your mouth, until you are empty.",
      "Repeat. Five minutes a day is the version the research tested.",
    ],
    why: "The second sniff helps reopen the smallest air sacs in your lungs, and the long exhale slows you down. In a month-long randomised trial, five minutes of this a day improved mood more than mindfulness meditation did.",
    evidenceLabel: "Balban et al., Cell Reports Medicine, 2023",
    evidenceUrl: "https://pubmed.ncbi.nlm.nih.gov/36630953/",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    slug: "nadi-shodhana",
    shape: "lobes",
    name: "Nadi Shodhana",
    subtitle: "Alternate-nostril breathing",
    description: "Close one nostril, inhale; close the other, exhale. Alternate sides each cycle.",
    benefit: "Balance and mental clarity.",
    contraindications: "Skip it if your nose is blocked. Ease off the holds if you feel light-headed.",
    level: "intermediate",
    intents: ["balance", "focus"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "In through the left", side: "left" },
      { kind: "hold", seconds: 4, cue: "Hold, both sides closed" },
      { kind: "exhale", seconds: 8, cue: "Out through the right", side: "right" },
      { kind: "inhale", seconds: 4, cue: "In through the right", side: "right" },
      { kind: "hold", seconds: 4, cue: "Hold, both sides closed" },
      { kind: "exhale", seconds: 8, cue: "Out through the left", side: "left" },
    ],
    maxCycles: null,
    defaultCycles: 10,
    howTo: [
      "Sit tall and rest your left hand in your lap.",
      "Your right thumb closes the right nostril; your ring finger closes the left.",
      "Follow the screen. It shows which side is open for every breath.",
      "One round is in left, out right, in right, out left.",
    ],
    why: "The slow count, and the attention that switching sides takes, leave little room for anything else, which is much of why it settles the mind. It is a staple of pranayama.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    slug: "bhramari",
    shape: "ripple",
    name: "Bhramari",
    subtitle: "Humming bee breath",
    description: "Inhale through the nose, then hum steadily all the way through the exhale.",
    benefit: "Quietens anxiety quickly; the vibration is the active ingredient.",
    contraindications: "Skip with an ear infection.",
    level: "beginner",
    intents: ["calm", "sleep"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "Breathe in through your nose" },
      { kind: "exhale", seconds: 8, cue: "Hum, mmmm", label: "Hum", hum: true },
    ],
    maxCycles: null,
    defaultCycles: 8,
    howTo: [
      "Sit comfortably and close your eyes.",
      "If you like, rest your index fingers on the flap of cartilage at the front of each ear.",
      "Breathe in through your nose.",
      "Breathe out slowly while humming, lips closed. Feel the buzz in your face and head.",
    ],
    why: "Humming stretches the exhale without effort, and the vibration gives your attention something physical to rest on.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    slug: "kapalabhati",
    shape: "pulse",
    name: "Kapalabhati",
    subtitle: "Skull-shining breath",
    description:
      "Short, sharp exhales through the nose with the belly. The breath in happens by itself.",
    benefit: "Wakes you up. Warming, and clearing when the head feels dull.",
    contraindications:
      "Not while pregnant, or with high blood pressure, a heart condition, epilepsy, glaucoma, a hernia, recent abdominal surgery, or on a full stomach. Stop at once if you feel dizzy or light-headed and breathe normally.",
    level: "expert",
    intents: ["energy"],
    phases: [
      { kind: "pump", seconds: 20, rate: 1, cue: "Sharp out through the nose", label: "Pump" },
      { kind: "rest", seconds: 40, cue: "Breathe normally", label: "Rest" },
    ],
    maxCycles: 3,
    defaultCycles: 3,
    howTo: [
      "Sit upright, somewhere you could stay for a few minutes. Do not do this lying down.",
      "Rest a hand on your belly. Breathe in to about half full.",
      "Pull the belly sharply in to push the air out through your nose. The breath in after it happens on its own — do not help it.",
      "Follow the screen: one pump a second, twenty a round.",
      "Between rounds, breathe normally and do nothing. That rest is part of the practice, not a gap in it.",
      "If you feel dizzy or tingly, stop. That is the signal to stop, not to push on.",
    ],
    why: "Every other practice here slows you down; this one does the opposite. The forceful exhales are driven by the belly while the in-breath stays passive, which is why it is taught as cleansing rather than calming.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    slug: "extended-exhale",
    shape: "orb",
    name: "Extended Exhale",
    subtitle: "Out for longer than in",
    description: "Breathe in for four, out for six. No holds, nothing to strain against.",
    benefit: "The gentlest way down. Safe for anyone, any time.",
    contraindications: null,
    level: "beginner",
    intents: ["calm", "sleep"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "Breathe in" },
      { kind: "exhale", seconds: 6, cue: "Breathe out slowly" },
    ],
    maxCycles: null,
    defaultCycles: 30,
    howTo: [
      "Sit or lie down, whichever is more comfortable.",
      "Breathe in through your nose for four.",
      "Breathe out through your nose for six, smooth and unhurried.",
      "If six feels long, breathe more shallowly rather than faster.",
    ],
    why: "Breathing out is the half of the breath that slows your heart, so making the exhale longer than the inhale is the simplest way there is to settle. Nothing is held, so there is nothing to brace against.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    slug: "ujjayi",
    shape: "orb",
    name: "Ujjayi",
    subtitle: "Ocean breath",
    description: "Breathe through the nose with the throat slightly narrowed, so each breath has a soft sound to follow.",
    benefit: "Steadies you without counting. The sound does the work.",
    contraindications: "Stop if your throat feels sore or you become light-headed.",
    level: "beginner",
    intents: ["calm", "focus"],
    phases: [
      { kind: "inhale", seconds: 5, cue: "In through the nose, softly" },
      { kind: "exhale", seconds: 5, cue: "Out with a whisper in the throat" },
    ],
    maxCycles: null,
    defaultCycles: 27,
    howTo: [
      "Mouth closed, breathing through your nose throughout.",
      "Narrow the back of your throat a little, as though fogging a mirror with your mouth shut.",
      "You should hear a soft hiss, like surf heard from a distance. It is a whisper, not a strain.",
      "Keep both halves of the breath the same length.",
    ],
    why: "The narrowed throat slows the air, which lengthens every breath without you having to count. The sound gives your attention something steady to rest on.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    slug: "anulom-vilom",
    shape: "lobes",
    name: "Anulom Vilom",
    subtitle: "Alternate nostrils, no holds",
    description: "The alternation of Nadi Shodhana without the breath holds. A gentler place to start.",
    benefit: "Balance and a quiet mind, with nothing held.",
    contraindications: "Skip it if your nose is blocked.",
    level: "beginner",
    intents: ["balance", "calm"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "In through the left", side: "left" },
      { kind: "exhale", seconds: 4, cue: "Out through the right", side: "right" },
      { kind: "inhale", seconds: 4, cue: "In through the right", side: "right" },
      { kind: "exhale", seconds: 4, cue: "Out through the left", side: "left" },
    ],
    maxCycles: null,
    defaultCycles: 10,
    howTo: [
      "Sit tall, left hand resting in your lap.",
      "Right thumb closes the right nostril; your ring finger closes the left.",
      "Follow the screen: it shows which side is open for each breath.",
      "One round is in left, out right, in right, out left.",
    ],
    why: "The same alternation as Nadi Shodhana, without holding the breath, so it suits anyone the holds do not. Switching sides takes just enough attention to keep the mind from wandering.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    slug: "sheetali",
    shape: "orb",
    name: "Sheetali",
    subtitle: "The cooling breath",
    description: "Draw the air in across a rolled tongue, then breathe out through the nose.",
    benefit: "Cooling. Good after training, or in the heat.",
    contraindications: "Not when you are already cold or your nose is blocked, and not if cold air sets off your asthma.",
    level: "beginner",
    intents: ["recover", "calm"],
    phases: [
      { kind: "inhale", seconds: 4, cue: "In through a rolled tongue" },
      { kind: "exhale", seconds: 6, cue: "Out through your nose" },
    ],
    maxCycles: null,
    defaultCycles: 20,
    howTo: [
      "Roll your tongue into a tube and let the tip sit just past your lips.",
      "If your tongue will not roll, part your teeth and draw the air through them instead. That version is Sheetkari.",
      "Draw the air in through the tube. It should feel cool.",
      "Close your mouth and breathe out through your nose.",
    ],
    why: "Air drawn across a wet tongue cools as the moisture evaporates, which is why this one is taught for heat and for cooling down after effort.",
    evidenceLabel: null,
    evidenceUrl: null,
  },
];

export const PATTERNS: Pattern[] = SEEDS.map(builtIn);

/** One practice of your own, and your own timings for Box Breathing. */
export const MINE: UserPattern[] = [
  {
    id: "00000000-0000-4000-9000-000000000001",
    basePatternId: null,
    name: "Evening wind-down",
    phases: [
      { kind: "inhale", seconds: 4, cue: "Breathe in" },
      { kind: "exhale", seconds: 8, cue: "Breathe out" },
    ],
  },
  {
    id: "00000000-0000-4000-9000-000000000002",
    basePatternId: SEEDS[0].id,
    name: "Box Breathing",
    phases: [
      { kind: "inhale", seconds: 5, cue: "Breathe in" },
      { kind: "hold", seconds: 5, cue: "Hold" },
      { kind: "exhale", seconds: 5, cue: "Breathe out" },
      { kind: "hold", seconds: 5, cue: "Hold" },
    ],
  },
];

/** What the tab actually shows: ours, retimed where you have retimed them, plus yours. */
export const PRACTICES: Pattern[] = withUserPatterns(PATTERNS, MINE);

export const PREFS: BreathingPrefs = { ...DEFAULT_PREFS, defaultMinutes: 5 };

/**
 * The routines, as 20260915090000_breathe_routines.sql seeds them, plus one
 * two-step routine that exists only here: `quick` runs in seconds, so the whole
 * chain -- step, hand-off, step, ending -- can be watched end to end.
 */
const ROUTINE_SEEDS: Array<Omit<Routine, "id">> = [
  {
    slug: "downshift",
    name: "Downshift",
    subtitle: "After training",
    description: "Drop the heart rate first, then settle into something you could keep doing.",
    about: "Hard effort leaves the sympathetic side of your nervous system switched on.",
    intents: ["recover", "calm"],
    steps: [
      { slug: "physiological-sigh", cycles: 5 },
      { slug: "extended-exhale", minutes: 2 },
      { slug: "coherent-breathing", minutes: 2 },
    ],
  },
  {
    slug: "wind-down",
    name: "Wind Down",
    subtitle: "For sleep",
    description: "Long exhales, then the count that stops you thinking, then the hum.",
    about: "Each step is quieter than the one before it.",
    intents: ["sleep", "calm"],
    steps: [
      { slug: "extended-exhale", minutes: 3 },
      { slug: "four-seven-eight", cycles: 4 },
      { slug: "bhramari", minutes: 2 },
    ],
  },
  {
    slug: "quick",
    name: "Quick Test",
    subtitle: "Harness only",
    description: "Two short steps, for watching the hand-off between them.",
    about: null,
    intents: ["calm"],
    steps: [
      { slug: "physiological-sigh", cycles: 2 },
      { slug: "coherent-breathing", cycles: 2 },
    ],
  },
];

export const ROUTINES: ResolvedRoutine[] = ROUTINE_SEEDS.map((seed, i) =>
  resolveRoutine({ ...seed, id: `00000000-0000-4000-a000-00000000000${i + 1}` }, PRACTICES),
).filter((r): r is ResolvedRoutine => r !== null);

/**
 * The course, as 20260918090000_breathe_journey.sql seeds it, but with every
 * day counted in breaths rather than minutes so a day can be watched from
 * Start to ending in well under a minute.
 *
 * The seventh day is a `pick: "best"` day here too, so the harness exercises
 * the branch that chooses a practice from the check-ins rather than from the
 * course.
 */
export const JOURNEY: Journey = {
  id: "00000000-0000-4000-b000-000000000001",
  slug: "foundations",
  name: "Breath foundations",
  subtitle: "Seven days",
  description:
    "One practice a day for a week, each teaching one thing. By the end you will know which of them works on you.",
  about: "The order is deliberate: the mechanism first, then the holds, then attention, then sound.",
  days: [
    { slug: "physiological-sigh", cycles: 2, title: "The fastest way down", teaches: "Two breaths in, one long breath out." },
    { slug: "coherent-breathing", cycles: 2, title: "A rhythm you can hold", teaches: "In and out, evenly, with nothing to count." },
    { slug: "extended-exhale", cycles: 2, title: "The exhale is the brake", teaches: "Breathing out is the half that slows your heart." },
    { slug: "box-breathing", cycles: 2, title: "Holding still is part of it", teaches: "Four equal sides, two of which do not move." },
    { slug: "anulom-vilom", cycles: 1, title: "Attention needs somewhere to go", teaches: "Your hand closes one nostril, then the other." },
    { slug: "bhramari", cycles: 2, title: "A breath you can feel", teaches: "The hum turns the exhale into something physical." },
    { pick: "best", slug: "coherent-breathing", cycles: 2, title: "The one that works on you", teaches: "Whichever of them left you calmest. Your evidence, not ours." },
  ],
};

/** Someone part-way through: three days done, and today's is open. */
export const JOURNEY_PROGRESS: JourneyProgress = {
  daysCompleted: 3,
  startedOn: "2026-09-09",
  lastDayOn: "2026-09-11",
  completed: false,
};

/**
 * The course at any point in it, so every state on the screen -- not started,
 * part-way, waiting for tomorrow, finished -- can be opened by URL rather than
 * waited for over seven real days.
 */
export function fixtureJourney({
  daysCompleted = JOURNEY_PROGRESS.daysCompleted,
  doneToday = false,
  today,
  shifts = [],
}: {
  daysCompleted?: number;
  /** Today's day is already counted, so the next one waits for tomorrow. */
  doneToday?: boolean;
  today: string;
  shifts?: CalmShift[];
}): ResolvedJourney | null {
  const done = Math.max(0, Math.min(daysCompleted, JOURNEY.days.length));
  return resolveJourney({
    journey: JOURNEY,
    patterns: PRACTICES,
    progress: {
      daysCompleted: done,
      startedOn: addDays(today, -done),
      lastDayOn: done === 0 ? null : doneToday ? today : addDays(today, -1),
      completed: done === JOURNEY.days.length,
    },
    today,
    shifts,
  });
}
