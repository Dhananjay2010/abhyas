/**
 * The breathing timeline, lengths, clock and stats.
 *
 * Every pattern here mirrors its row in
 * supabase/migrations/20260912090000_breathe_phase_one.sql, because the bugs
 * worth catching are pattern-specific: Nadi Shodhana's sides, the sigh's
 * two-part inhale, 4-7-8's cap.
 *
 *   npx tsx scripts/test-breathing.ts
 */
import {
  buildCycle,
  cyclesForMinutes,
  easeInOutSine,
  initialCycles,
  lengthLabel,
  lengthPlan,
  nextPhaseStart,
  positionAt,
  pumpAt,
  type BreathPhase,
} from "../src/lib/breathing/engine";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PausableClock } from "../src/lib/breathing/clock";
import { breathingStats } from "../src/lib/breathing/stats";
import {
  DEFAULT_PREFS,
  asShape,
  draftFrom,
  mineId,
  mineSlug,
  needsConfirming,
  parsePhases,
  parseSessionSearch,
  patternFromUser,
  sessionSearch,
  toEditorSlots,
  withUserPatterns,
  type Pattern,
} from "../src/lib/breathing/pattern";
import {
  MAX_DAYS,
  NO_PROGRESS,
  bestRated,
  dayLine,
  parseDays,
  resolveJourney,
  type Journey,
  type JourneyDay,
} from "../src/lib/breathing/journey";
import {
  parseSteps,
  resolveRoutine,
  routineLength,
  stepNames,
  type Routine,
  type RoutineStep,
} from "../src/lib/breathing/routine";
import { suggestPractice } from "../src/lib/breathing/suggest";
import { calmShifts, type CalmShift } from "../src/lib/breathing/stats";
import {
  validatePatternDraft,
  validatePractice,
  validatePrefs,
} from "../src/lib/breathing/validation";
import { uuid } from "../src/lib/breathing/client";
import { spokenCue } from "../src/lib/breathing/speech";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const BOX: BreathPhase[] = [
  { kind: "inhale", seconds: 4, cue: "Breathe in" },
  { kind: "hold", seconds: 4, cue: "Hold" },
  { kind: "exhale", seconds: 4, cue: "Breathe out" },
  { kind: "hold", seconds: 4, cue: "Hold" },
];
const FOUR_SEVEN_EIGHT: BreathPhase[] = [
  { kind: "inhale", seconds: 4, cue: "Breathe in through your nose" },
  { kind: "hold", seconds: 7, cue: "Hold" },
  { kind: "exhale", seconds: 8, cue: "Out through your mouth, whoosh" },
];
const COHERENT: BreathPhase[] = [
  { kind: "inhale", seconds: 5.5, cue: "Breathe in" },
  { kind: "exhale", seconds: 5.5, cue: "Breathe out" },
];
const SIGH: BreathPhase[] = [
  { kind: "inhale", seconds: 2, cue: "Breathe in through your nose", to: 0.8 },
  { kind: "inhale", seconds: 1, cue: "Sniff to top it up", label: "Sniff" },
  { kind: "exhale", seconds: 6, cue: "Long breath out through your mouth" },
];
const NADI: BreathPhase[] = [
  { kind: "inhale", seconds: 4, cue: "In through the left", side: "left" },
  { kind: "hold", seconds: 4, cue: "Hold, both sides closed" },
  { kind: "exhale", seconds: 8, cue: "Out through the right", side: "right" },
  { kind: "inhale", seconds: 4, cue: "In through the right", side: "right" },
  { kind: "hold", seconds: 4, cue: "Hold, both sides closed" },
  { kind: "exhale", seconds: 8, cue: "Out through the left", side: "left" },
];
const BHRAMARI: BreathPhase[] = [
  { kind: "inhale", seconds: 4, cue: "Breathe in through your nose" },
  { kind: "exhale", seconds: 8, cue: "Hum, mmmm", label: "Hum", hum: true },
];
const KAPALABHATI: BreathPhase[] = [
  { kind: "pump", seconds: 20, rate: 1, cue: "Sharp out through the nose", label: "Pump" },
  { kind: "rest", seconds: 40, cue: "Breathe normally", label: "Rest" },
];
const EXTENDED: BreathPhase[] = [
  { kind: "inhale", seconds: 4, cue: "Breathe in" },
  { kind: "exhale", seconds: 6, cue: "Breathe out slowly" },
];

/** A built-in pattern with only the fields the routine code reads. */
function fakePattern(
  slug: string,
  name: string,
  phases: BreathPhase[],
  maxCycles: number | null = null,
): Pattern {
  return {
    id: uuid(), slug, name, subtitle: null, description: null, benefit: null,
    contraindications: null, level: "beginner", intents: [], phases, maxCycles,
    defaultCycles: 10, howTo: [], why: null, evidenceLabel: null, evidenceUrl: null,
    shape: "orb", kind: "builtin", userPatternId: null, adjusted: false, defaultPhases: phases,
  };
}

const fakeRoutine = (steps: RoutineStep[]): Routine => ({
  id: uuid(), slug: "downshift", name: "Downshift", subtitle: "After training",
  description: "…", about: null, intents: ["recover"], steps,
});

console.log("\n1. Box breathing walks in, hold, out, hold, and the orb follows");
{
  const c = buildCycle(BOX);
  check("one cycle is 16 seconds", c.seconds === 16, `${c.seconds}`);
  check("one breath per cycle", c.breaths === 1, `${c.breaths}`);
  const at = (t: number) => positionAt(c, 10, t);
  check("t=0 is the inhale, orb empty", at(0).phase.kind === "inhale" && at(0).size === 0);
  check("half-way through the inhale the orb is half full", near(at(2).size, 0.5), `${at(2).size}`);
  check("t=4 is the top hold, orb full", at(4).phase.kind === "hold" && at(4).size === 1);
  check("the top hold does not move", at(6).size === 1);
  check("t=8 is the exhale", at(8).phase.kind === "exhale");
  check("t=12 is the bottom hold, orb empty", at(12).phase.index === 3 && at(12).size === 0);
  check("t=16 starts cycle 2", at(16).cycleIndex === 1 && at(16).phase.index === 0);
  check("seconds left in a phase count down", near(at(5).phaseRemaining, 3), `${at(5).phaseRemaining}`);
}

console.log("\n2. 4-7-8 has no hold after the exhale");
{
  const c = buildCycle(FOUR_SEVEN_EIGHT);
  check("three phases, 19 seconds", c.phases.length === 3 && c.seconds === 19);
  const p = positionAt(c, 4, 19);
  check("after the exhale comes the next inhale", p.phase.kind === "inhale" && p.cycleIndex === 1);
  const zeroHold = buildCycle([...FOUR_SEVEN_EIGHT, { kind: "hold", seconds: 0, cue: "Hold" }]);
  check("a zero-length phase is dropped", zeroHold.phases.length === 3);
  let threw = false;
  try {
    buildCycle([{ kind: "hold", seconds: 0, cue: "x" }]);
  } catch {
    threw = true;
  }
  check("a pattern with no timed phase is rejected", threw);
}

console.log("\n3. Nadi Shodhana names the open side for every phase (bug B2)");
{
  const c = buildCycle(NADI);
  const at = (t: number) => positionAt(c, 5, t).phase;
  check("in through the LEFT first", at(0).side === "left" && at(0).kind === "inhale");
  check("the hold has no side", at(5).side === null);
  check("out through the RIGHT on the first exhale", at(8).side === "right" && at(8).kind === "exhale");
  check("then in through the RIGHT", at(16).side === "right" && at(16).kind === "inhale");
  check("and out through the LEFT", at(24).side === "left" && at(24).kind === "exhale");
  check("the second round starts on the left again", at(32).side === "left" && at(32).kind === "inhale");
  check("a round is two breaths", c.breaths === 2, `${c.breaths}`);
}

console.log("\n4. The physiological sigh is a two-part inhale (bug B7)");
{
  const c = buildCycle(SIGH);
  check("first inhale stops at 0.8", c.phases[0].from === 0 && near(c.phases[0].to, 0.8));
  check("the sniff tops up from 0.8 to full", near(c.phases[1].from, 0.8) && c.phases[1].to === 1);
  check("the sniff is labelled", c.phases[1].label === "Sniff");
  check("the exhale empties from full", c.phases[2].from === 1 && c.phases[2].to === 0);
  check("the sniff is not a second breath", c.breaths === 1, `${c.breaths}`);
}

console.log("\n5. Bhramari hums on the exhale (bug B7)");
{
  const c = buildCycle(BHRAMARI);
  check("the exhale says to hum", c.phases[1].cue.startsWith("Hum") && c.phases[1].label === "Hum");
  check("and is marked as hummed, so the guide hums with you", c.phases[1].hum && !c.phases[0].hum);
}

console.log("\n6. Fractional seconds do not drift");
{
  const c = buildCycle(COHERENT);
  const p = positionAt(c, 100, 5.5 + 11 * 99);
  check("the 100th exhale starts exactly where it should", p.phase.kind === "exhale" && p.cycleIndex === 99,
    `${p.phase.kind} in cycle ${p.cycleIndex}`);
  check("the total is exact", near(positionAt(c, 27, 0).total, 297));
}

console.log("\n7. The end");
{
  const c = buildCycle(BOX);
  const p = positionAt(c, 3, 48);
  check("t = total is done", p.done && p.completedCycles === 3);
  check("past the end is still done", positionAt(c, 3, 500).done);
  check("finished cycles are counted before the end", positionAt(c, 3, 33).completedCycles === 2);
  check("the orb ends where the last phase ends", p.size === 0);
}

console.log("\n8. The next phase to schedule sound for");
{
  const c = buildCycle(BOX);
  const n1 = nextPhaseStart(c, 2, -1);
  check("during the settle-in it is the very first phase", n1?.at === 0 && n1.phase.index === 0);
  const n2 = nextPhaseStart(c, 2, 1);
  check("mid-inhale it is the hold at 4s", n2?.at === 4 && n2.phase.kind === "hold");
  const n3 = nextPhaseStart(c, 2, 15);
  check("the last phase wraps into the next cycle", n3?.at === 16 && n3.cycleIndex === 1 && n3.phase.index === 0);
  check("nothing after the final phase", nextPhaseStart(c, 2, 29) === null);
}

console.log("\n9. Length in minutes, and 4-7-8 in breaths with a hard cap (bug B3)");
{
  const box = buildCycle(BOX);
  const plan = lengthPlan(box, null);
  check("box is chosen in minutes", plan.unit === "minutes");
  check("1/3/5/10 min become whole cycles",
    plan.options.map((o) => o.cycles).join(",") === "4,11,19,38", plan.options.map((o) => o.cycles).join(","));
  check("custom goes up to an hour", plan.maxMinutes === 60);

  const fse = buildCycle(FOUR_SEVEN_EIGHT);
  const capped = lengthPlan(fse, 8);
  check("4-7-8 is chosen in breaths", capped.unit === "breaths");
  check("and never more than eight", capped.options.map((o) => o.cycles).join(",") === "2,4,6,8",
    capped.options.map((o) => o.cycles).join(","));
  check("the options read as breaths", capped.options[1].label === "4 breaths", capped.options[1].label);
  check("no custom length past the cap", capped.maxMinutes === null);
  check("minutes are clamped to the cap", cyclesForMinutes(fse, 10, 8) === 8);

  // A capped pattern long enough to be chosen in minutes must not offer a
  // "10 min" that quietly runs for five.
  const long = lengthPlan(box, 20);
  check("options past the cap are dropped", long.options.every((o) => o.cycles <= 20),
    long.options.map((o) => `${o.label}=${o.cycles}`).join(" "));
  check("custom stops at the cap", long.maxMinutes === 5, `${long.maxMinutes}`);

  const nadi = lengthPlan(buildCycle(NADI), null);
  check("Nadi Shodhana's 1 min is two full rounds", nadi.options[0].cycles === 2, `${nadi.options[0].cycles}`);
}

console.log("\n10. Where the length starts, and how it reads");
{
  const box = buildCycle(BOX);
  const fse = buildCycle(FOUR_SEVEN_EIGHT);
  check("last time's length wins",
    initialCycles({ cycle: box, maxCycles: null, defaultCycles: 10, preferredMinutes: 10, lastCycles: 7 }) === 7);
  check("but never past the cap",
    initialCycles({ cycle: fse, maxCycles: 8, defaultCycles: 4, preferredMinutes: 10, lastCycles: 30 }) === 8);
  check("a breaths pattern starts at its own count",
    initialCycles({ cycle: fse, maxCycles: 8, defaultCycles: 4, preferredMinutes: 10, lastCycles: null }) === 4);
  check("otherwise your usual minutes",
    initialCycles({ cycle: box, maxCycles: null, defaultCycles: 10, preferredMinutes: 5, lastCycles: null }) === 19);
  check("box, 19 cycles reads 5 min", lengthLabel(box, 19, null) === "5 min", lengthLabel(box, 19, null));
  check("4-7-8, 4 cycles reads 4 breaths", lengthLabel(fse, 4, 8) === "4 breaths");
  check("under a minute reads in seconds", lengthLabel(buildCycle(SIGH), 2, null) === "Under a minute");
  check("one breath is singular", lengthPlan(fse, 1).options[0].label === "1 breath", lengthPlan(fse, 1).options[0].label);
}

console.log("\n11. Easing");
{
  check("starts at 0, ends at 1", easeInOutSine(0) === 0 && near(easeInOutSine(1), 1));
  check("half-way is half", near(easeInOutSine(0.5), 0.5));
  let monotonic = true;
  for (let i = 1; i <= 100; i++) if (easeInOutSine(i / 100) < easeInOutSine((i - 1) / 100)) monotonic = false;
  check("never goes backwards", monotonic);
}

console.log("\n12. The clock does not count paused time");
{
  let now = 0;
  const clock = new PausableClock(() => now);
  check("nothing before it starts", clock.elapsed() === 0);
  clock.resume();
  now = 1000;
  check("one second in", near(clock.elapsed(), 1));
  now = 1500;
  clock.pause();
  now = 9000;
  check("paused time is not counted", near(clock.elapsed(), 1.5), `${clock.elapsed()}`);
  clock.resume();
  now = 10000;
  check("it carries on from where it stopped", near(clock.elapsed(), 2.5), `${clock.elapsed()}`);
  clock.resume();
  now = 10500;
  check("resuming twice changes nothing", near(clock.elapsed(), 3), `${clock.elapsed()}`);
  clock.advance(5);
  check("skipping ahead adds the skipped time", near(clock.elapsed(), 8), `${clock.elapsed()}`);
}

console.log("\n13. The week and the streak");
{
  // 2026-09-12 is a Saturday.
  const s = breathingStats(
    [
      { localDate: "2026-09-07", seconds: 300 }, // Mon
      { localDate: "2026-09-10", seconds: 120 }, // Thu
      { localDate: "2026-09-11", seconds: 60 },  // Fri
      { localDate: "2026-09-11", seconds: 60 },  // Fri, twice
      { localDate: "2026-09-05", seconds: 600 }, // last week
    ],
    "2026-09-12",
  );
  check("the week starts on Monday", s.weekStart === "2026-09-07", s.weekStart);
  check("dots on Mon, Thu, Fri", s.weekDays.map((d) => (d ? 1 : 0)).join("") === "1001100",
    s.weekDays.map((d) => (d ? 1 : 0)).join(""));
  check("only this week's seconds", s.weekSeconds === 540, `${s.weekSeconds}`);
  check("an empty today does not break the streak", s.streak === 2, `${s.streak}`);

  const today = breathingStats([{ localDate: "2026-09-12", seconds: 60 }, { localDate: "2026-09-11", seconds: 60 }], "2026-09-12");
  check("today counts once it is done", today.streak === 2, `${today.streak}`);
  const gap = breathingStats([{ localDate: "2026-09-10", seconds: 60 }], "2026-09-12");
  check("a missed day breaks it", gap.streak === 0, `${gap.streak}`);
}

console.log("\n14. Pattern rows are checked before they reach the player");
{
  const exhale = { kind: "exhale", seconds: 4, cue: "Out" };
  check("a good phase list parses", parsePhases(BOX) !== null);
  check("an unknown kind is refused", parsePhases([{ kind: "breathe", seconds: 4, cue: "x" }, exhale]) === null);
  check("a negative length is refused", parsePhases([{ kind: "inhale", seconds: -1, cue: "In" }, exhale]) === null);
  check("a phase with no words is refused", parsePhases([{ kind: "inhale", seconds: 4, cue: " " }, exhale]) === null);
  check("a pattern that never breathes out is refused", parsePhases([{ kind: "inhale", seconds: 4, cue: "In" }]) === null);
  check("anything but an array is refused", parsePhases({}) === null && parsePhases(null) === null && parsePhases([]) === null);
  const kept = parsePhases(NADI.slice(0, 3).concat(SIGH.slice(1, 2)));
  check("side, label and size survive", kept?.[0].side === "left" && kept?.[3].label === "Sniff");
  const odd = parsePhases([{ kind: "inhale", seconds: 4, cue: "In", side: "middle", to: 7 }, exhale]);
  check("a bad side or size is dropped, not trusted", odd !== null && odd[0].side === undefined && odd[0].to === undefined);
}

console.log("\n15. Every pattern the migration seeds parses and builds");
{
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260912090000_breathe_phase_one.sql"), "utf8");
  const blocks = [...sql.matchAll(/phases = '(\[[\s\S]*?\])'::jsonb/g)].map((m) => m[1]);
  check("six phase lists found", blocks.length === 6, `${blocks.length}`);
  blocks.forEach((b, i) => {
    const phases = parsePhases(JSON.parse(b));
    check(`pattern ${i + 1} parses and builds`, phases !== null && buildCycle(phases).seconds > 0);
  });
}

console.log("\n16. A session URL cannot ask for more than the setup screen allows");
{
  // In the order parseSessionSearch returns them, so the round trip can be
  // compared as a whole.
  const o = {
    cycles: 19,
    guidance: "ocean",
    ambience: "rain",
    ambienceVolume: 70,
    voiceLang: "hi",
    showCount: false,
    vibrate: true,
    settleIn: false,
    checkIn: "both",
  } as const;
  const back = parseSessionSearch(
    Object.fromEntries(new URLSearchParams(sessionSearch(o))),
    DEFAULT_PREFS,
    { fallbackCycles: 5, maxCycles: null, cycleSeconds: 16 },
  );
  check("what was chosen is what runs", JSON.stringify(back) === JSON.stringify(o), JSON.stringify(back));
  const capped = parseSessionSearch({ cycles: "30" }, DEFAULT_PREFS, { fallbackCycles: 4, maxCycles: 8, cycleSeconds: 19 });
  check("cycles past the cap are clamped", capped.cycles === 8, `${capped.cycles}`);
  const hour = parseSessionSearch({ cycles: "5000" }, DEFAULT_PREFS, { fallbackCycles: 4, maxCycles: null, cycleSeconds: 16 });
  check("nothing longer than an hour", hour.cycles === 225, `${hour.cycles}`);
  const junk = parseSessionSearch(
    { cycles: "abc", sound: "loud", checkin: "x", count: "maybe", amb: "thunder", lang: "ta", vol: "999" },
    DEFAULT_PREFS,
    { fallbackCycles: 7, maxCycles: null, cycleSeconds: 16 },
  );
  check("junk falls back to your preferences",
    junk.cycles === 7 && junk.guidance === DEFAULT_PREFS.guidance &&
    junk.checkIn === DEFAULT_PREFS.checkIn && junk.showCount === DEFAULT_PREFS.showCount &&
    junk.ambience === DEFAULT_PREFS.ambience && junk.voiceLang === DEFAULT_PREFS.voiceLang,
    JSON.stringify(junk));
  const loud = parseSessionSearch({ vol: "480" }, DEFAULT_PREFS, { fallbackCycles: 7, maxCycles: null, cycleSeconds: 16 });
  check("a silly volume is clamped, not obeyed", loud.ambienceVolume === 100, `${loud.ambienceVolume}`);
}

console.log("\n17. What the server accepts as a practice");
{
  const good = {
    logId: "3f1f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e6f",
    patternId: "70bd9d9e-dd90-4db7-bafc-e2553c19277f",
    userPatternId: null,
    cycles: 4, plannedCycles: 4, breaths: 4, seconds: 64,
    endedEarly: false, moodBefore: null, guidance: "tones" as const,
  };
  check("a normal practice passes", validatePractice(good) === null);
  check("a practice of your own passes",
    validatePractice({ ...good, patternId: null, userPatternId: "1d0f3b6a-2c4e-4a7b-8c9d-0e1f2a3b4c5d" }) === null);
  check("a practice belonging to neither is refused",
    validatePractice({ ...good, patternId: null }) !== null);
  check("a malformed practice id of your own is refused",
    validatePractice({ ...good, userPatternId: "nope" }) !== null);
  check("zero breaths is refused", validatePractice({ ...good, cycles: 0 }) !== null);
  check("more cycles than planned is refused", validatePractice({ ...good, cycles: 5 }) !== null);
  check("a fractional second count is refused", validatePractice({ ...good, seconds: 63.5 }) !== null);
  check("a mood outside 1-5 is refused", validatePractice({ ...good, moodBefore: 6 }) !== null);
  check("every sound mode that exists is accepted",
    (["tones", "ocean", "voice", "off"] as const).every((g) => validatePractice({ ...good, guidance: g }) === null));
  check("a sound mode that does not exist is refused", validatePractice({ ...good, guidance: "whale" as never }) !== null);
  check("a malformed id is refused", validatePractice({ ...good, logId: "1" }) !== null);
  check("preferences: only the listed lengths", validatePrefs({ defaultMinutes: 7 }) !== null && validatePrefs({ defaultMinutes: 5 }) === null);
  check("preferences: only real check-in modes", validatePrefs({ checkIn: "sometimes" as never }) !== null);
  check("preferences: only real background sounds",
    validatePrefs({ ambience: "thunder" as never }) !== null && validatePrefs({ ambience: "rain" }) === null);
  check("preferences: volume within 0-100",
    validatePrefs({ ambienceVolume: 140 }) !== null && validatePrefs({ ambienceVolume: 40 }) === null);
  check("preferences: only the two voice languages",
    validatePrefs({ voiceLang: "ta" as never }) !== null && validatePrefs({ voiceLang: "hi" }) === null);
}

console.log("\n19. What the voice says (short, and in the right language)");
{
  const nadi = buildCycle(NADI).phases;
  const sigh = buildCycle(SIGH).phases;
  const bhramari = buildCycle(BHRAMARI).phases;
  check("plain inhale", spokenCue(buildCycle(BOX).phases[0], "en") === "Breathe in");
  check("a hold", spokenCue(buildCycle(BOX).phases[1], "en") === "Hold");
  check("in through the left", spokenCue(nadi[0], "en") === "In through the left");
  check("out through the right", spokenCue(nadi[2], "en") === "Out through the right");
  check("the sigh's second inhale is a sniff", spokenCue(sigh[1], "en", true) === "Sniff");
  check("but a first inhale is not", spokenCue(sigh[0], "en", false) === "Breathe in");
  check("a hummed exhale says hum", spokenCue(bhramari[1], "en") === "Hum");
  check("Hindi for breathe in", spokenCue(buildCycle(BOX).phases[0], "hi") === "साँस लीजिए");
  check("Hindi for a hold", spokenCue(buildCycle(BOX).phases[1], "hi") === "रोकिए");
  check("Hindi names the nostril", spokenCue(nadi[2], "hi") === "दाएँ नथुने से छोड़िए");
}

console.log("\n18. Ids work without a secure context");
{
  const id = uuid();
  check("a v4 uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), id);
}

console.log("\n20. Your own timings, and your own practices");
{
  const good = { name: "Evening wind-down", phases: [BOX[0], BOX[2]] };
  check("a sound draft passes", validatePatternDraft(good) === null);
  check("it needs a name", validatePatternDraft({ ...good, name: "  " }) !== null);
  check("a very long name is refused", validatePatternDraft({ ...good, name: "x".repeat(61) }) !== null);
  check("timings go in half-seconds",
    validatePatternDraft({ ...good, phases: [{ ...BOX[0], seconds: 4.3 }, BOX[2]] }) !== null);
  check("half-seconds are fine",
    validatePatternDraft({ ...good, phases: [{ ...BOX[0], seconds: 4.5 }, BOX[2]] }) === null);
  check("a phase longer than a minute is refused",
    validatePatternDraft({ ...good, phases: [{ ...BOX[0], seconds: 61 }, BOX[2]] }) !== null);
  check("a breath longer than five minutes is refused",
    validatePatternDraft({ ...good, phases: [{ ...BOX[0], seconds: 60 }, { ...BOX[1], seconds: 60 }, { ...BOX[2], seconds: 60 }, { ...BOX[3], seconds: 60 }, { ...BOX[1], seconds: 60 }, { ...BOX[1], seconds: 60 }] }) !== null);
  check("it needs a way in", validatePatternDraft({ ...good, phases: [BOX[2]] }) !== null);
  check("and a way out", validatePatternDraft({ ...good, phases: [BOX[0]] }) !== null);

  const withHoldsOff = draftFrom("Mine", [BOX[0], { ...BOX[1], seconds: 0 }, BOX[2], { ...BOX[3], seconds: 0 }]);
  check("a hold set to zero is dropped when saved", withHoldsOff.phases.length === 2, `${withHoldsOff.phases.length}`);

  // Editing a saved practice used to fill the four slots by position, which
  // put an exhale in the hold's slot and offered a second exhale below it.
  const slots = toEditorSlots([
    { kind: "inhale", seconds: 4, cue: "Breathe in" },
    { kind: "exhale", seconds: 8, cue: "Breathe out" },
  ]);
  check("editing keeps each phase in its own slot",
    slots.map((p) => `${p.kind}:${p.seconds}`).join(" ") === "inhale:4 hold:0 exhale:8 hold:0",
    slots.map((p) => `${p.kind}:${p.seconds}`).join(" "));
  const bothHolds = toEditorSlots([
    { kind: "inhale", seconds: 4, cue: "In" },
    { kind: "hold", seconds: 2, cue: "Hold" },
    { kind: "exhale", seconds: 6, cue: "Out" },
    { kind: "hold", seconds: 3, cue: "Hold" },
  ]);
  check("two holds keep their order",
    bothHolds.map((p) => p.seconds).join(",") === "4,2,6,3", bothHolds.map((p) => p.seconds).join(","));
  check("a round trip through the editor is lossless",
    draftFrom("x", toEditorSlots(withHoldsOff.phases)).phases.length === 2);

  const builtins = [
    { ...patternFromUser({ id: "b1", basePatternId: null, name: "Box", phases: BOX }), kind: "builtin" as const, slug: "box-breathing", id: "b1" },
  ];
  const merged = withUserPatterns(builtins, [
    { id: "u1", basePatternId: "b1", name: "Box", phases: [{ ...BOX[0], seconds: 5 }, BOX[2]] },
    { id: "u2", basePatternId: null, name: "Evening wind-down", phases: [BOX[0], BOX[2]] },
  ]);
  check("your timings replace ours", merged[0].phases[0].seconds === 5 && merged[0].adjusted);
  check("and the practice keeps its own id", merged[0].id === "b1" && merged[0].userPatternId === "u1");
  check("your own practice joins the list", merged[1].kind === "mine" && merged[1].name === "Evening wind-down");
  check("and lives at a mine- slug", merged[1].slug === mineSlug("u2") && mineId(merged[1].slug) === "u2");
  check("an untouched built-in is not marked", withUserPatterns(builtins, [])[0].adjusted === false);
}

console.log("\n21. What to suggest for right now");
{
  const patterns = ["box-breathing", "four-seven-eight", "coherent-breathing", "physiological-sigh", "extended-exhale"].map(
    (slug) => ({ ...patternFromUser({ id: slug, basePatternId: null, name: slug, phases: BOX }), kind: "builtin" as const, slug, id: slug }),
  );
  const at = (hour: number, trainedToday = false, excludeId: string | null = null) =>
    suggestPractice({ patterns, hour, trainedToday, excludeId })?.pattern.slug;
  check("after training, the sigh", at(15, true) === "physiological-sigh");
  check("late at night, 4-7-8", at(22) === "four-seven-eight");
  check("early hours count as night", at(3) === "four-seven-eight");
  check("in the morning, the box", at(8) === "box-breathing");
  check("otherwise, coherent breathing", at(15) === "coherent-breathing");
  check("never the one already offered as Again", at(15, false, "coherent-breathing") === "extended-exhale");
  check("nothing to suggest from an empty list",
    suggestPractice({ patterns: [], hour: 9, trainedToday: false }) === null);
}

console.log("\n22. What works for you");
{
  const shifts = calmShifts([
    { patternName: "Box Breathing", moodBefore: 2, moodAfter: 4 },
    { patternName: "Box Breathing", moodBefore: 3, moodAfter: 5 },
    { patternName: "Box Breathing", moodBefore: null, moodAfter: 3 },
    { patternName: "4-7-8", moodBefore: 1, moodAfter: 4 },
    { patternName: "Bhramari", moodBefore: 2, moodAfter: null },
  ]);
  check("only practices you rated, and only with enough of them",
    shifts.length === 1 && shifts[0].patternName === "Box Breathing", JSON.stringify(shifts.map((s) => s.patternName)));
  check("counts every rated practice", shifts[0].practices === 3, `${shifts[0].practices}`);
  check("averages how you felt afterwards", near(shifts[0].averageAfter, 4), `${shifts[0].averageAfter}`);
  check("and the shift, from the ones with both", near(shifts[0].averageShift ?? -1, 2), `${shifts[0].averageShift}`);
  const noBefore = calmShifts([
    { patternName: "Ujjayi", moodBefore: null, moodAfter: 4 },
    { patternName: "Ujjayi", moodBefore: null, moodAfter: 5 },
  ]);
  check("no shift when you never checked in first", noBefore[0].averageShift === null);
}

console.log("\n23. Routines: the steps parse, resolve, and keep their order");
{
  const patterns: Pattern[] = [
    fakePattern("physiological-sigh", "Physiological Sigh", SIGH),
    fakePattern("extended-exhale", "Extended Exhale", EXTENDED),
    fakePattern("coherent-breathing", "Coherent Breathing", COHERENT),
    fakePattern("four-seven-eight", "4-7-8", FOUR_SEVEN_EIGHT, 8),
  ];
  const routine = fakeRoutine([
    { slug: "physiological-sigh", cycles: 5 },
    { slug: "extended-exhale", minutes: 2 },
    { slug: "coherent-breathing", minutes: 2 },
  ]);

  const r = resolveRoutine(routine, patterns);
  check("every step resolves", r !== null && r.steps.length === 3);
  if (r) {
    check("the order is the routine's order",
      r.steps.map((s) => s.pattern.slug).join(",") === "physiological-sigh,extended-exhale,coherent-breathing",
      r.steps.map((s) => s.pattern.slug).join(","));
    // The sigh is 9s a breath, so five breaths is 45s. Extended exhale is 10s,
    // so two minutes is 12 cycles. Coherent is 11s, so two minutes is 11.
    check("breaths are taken literally", r.steps[0].cycles === 5, `${r.steps[0].cycles}`);
    check("minutes become whole cycles", r.steps[1].cycles === 12 && r.steps[2].cycles === 11,
      `${r.steps[1].cycles}, ${r.steps[2].cycles}`);
    check("the total is the steps added up", near(r.seconds, 45 + 120 + 121), `${r.seconds}`);
    check("each step is labelled in its own unit",
      r.steps[0].label === "5 breaths" && r.steps[1].label === "2 min",
      `${r.steps[0].label} / ${r.steps[1].label}`);
  }

  // A step that is capped must not exceed the cap, however it is asked for.
  const capped = resolveRoutine(
    fakeRoutine([{ slug: "four-seven-eight", cycles: 40 }, { slug: "coherent-breathing", minutes: 1 }]),
    patterns,
  );
  check("a capped practice is held at its cap", capped !== null && capped.steps[0].cycles === 8,
    `${capped?.steps[0].cycles}`);

  check("a routine naming a missing practice is not offered",
    resolveRoutine(fakeRoutine([{ slug: "kapalabhati", minutes: 1 }, { slug: "coherent-breathing", minutes: 1 }]), patterns) === null);
  check("a practice of your own cannot be a step",
    resolveRoutine(fakeRoutine([{ slug: mineSlug(uuid()), minutes: 1 }, { slug: "coherent-breathing", minutes: 1 }]), patterns) === null);

  // Your timings change how long a step's breaths take, which is the point of
  // storing the length as an intent rather than as a cycle count.
  const slow = patterns.map((p) =>
    p.slug === "coherent-breathing"
      ? { ...p, phases: [
          { kind: "inhale" as const, seconds: 6, cue: "In" },
          { kind: "exhale" as const, seconds: 6, cue: "Out" },
        ], adjusted: true }
      : p,
  );
  const retimed = resolveRoutine(routine, slow);
  check("a retimed practice still runs for about as long",
    retimed !== null && retimed.steps[2].cycles === 10 && near(retimed.steps[2].seconds, 120),
    `${retimed?.steps[2].cycles} cycles, ${retimed?.steps[2].seconds}s`);

  check("a two-minute-ish routine reads as one", routineLength(286) === "About 5 min", routineLength(286));
  check("the steps are named for the card",
    r !== null && stepNames(r.steps) === "Physiological Sigh · Extended Exhale · Coherent Breathing");
}

console.log("\n24. Routine rows are checked before they reach the player");
{
  const ok = [{ slug: "a", minutes: 2 }, { slug: "b", cycles: 5 }];
  check("a well-formed pair passes", parseSteps(ok)?.length === 2);
  check("one step is not a routine", parseSteps([ok[0]]) === null);
  check("seven steps is too many", parseSteps(Array.from({ length: 7 }, () => ok[0])) === null);
  check("a step with no length is refused", parseSteps([{ slug: "a" }, ok[1]]) === null);
  check("a step with both units is refused", parseSteps([{ slug: "a", minutes: 2, cycles: 5 }, ok[1]]) === null);
  check("a nameless step is refused", parseSteps([{ minutes: 2 }, ok[1]]) === null);
  check("a fractional cycle count is refused", parseSteps([{ slug: "a", cycles: 2.5 }, ok[1]]) === null);
  check("an hour-long step is refused", parseSteps([{ slug: "a", minutes: 61 }, ok[1]]) === null);
  check("half-minutes are allowed", parseSteps([{ slug: "a", minutes: 2.5 }, ok[1]])?.[0].minutes === 2.5);
  check("not an array at all", parseSteps("downshift") === null);

  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260915090000_breathe_routines.sql"), "utf8");
  const blocks = [...sql.matchAll(/'(\[[\s\S]*?\])'::jsonb/g)].map((m) => m[1]);
  check("four step lists found in the migration", blocks.length === 4, `${blocks.length}`);
  blocks.forEach((b, i) => {
    check(`routine ${i + 1} parses`, parseSteps(JSON.parse(b)) !== null);
  });
}

console.log("\n25. A routine step is saved as all of a routine, or none of it");
{
  const good = {
    logId: "3f1f2c1e-8a4b-4c6d-9e0f-1a2b3c4d5e6f",
    patternId: "70bd9d9e-dd90-4db7-bafc-e2553c19277f",
    userPatternId: null,
    cycles: 4, plannedCycles: 4, breaths: 4, seconds: 64,
    endedEarly: false, moodBefore: null, guidance: "tones" as const,
  };
  const routineId = "8c2f1a3b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
  const sessionId = "9d3a2b4c-5e6f-4a7b-9c8d-1e2f3a4b5c6d";

  check("a practice on its own still passes", validatePractice(good) === null);
  check("the first step of a routine passes",
    validatePractice({ ...good, routineId, routineStep: 1 }) === null);
  check("a later step carrying its session passes",
    validatePractice({ ...good, routineId, routineStep: 2, sessionId }) === null);
  check("a step number without a routine is refused",
    validatePractice({ ...good, routineStep: 2 }) !== null);
  check("a routine without a step number is refused",
    validatePractice({ ...good, routineId }) !== null);
  check("a session without a routine is refused",
    validatePractice({ ...good, sessionId }) !== null);
  check("the first step must not carry a session",
    validatePractice({ ...good, routineId, routineStep: 1, sessionId }) !== null);
  check("a seventh step is refused",
    validatePractice({ ...good, routineId, routineStep: 7, sessionId }) !== null);
  check("a malformed routine id is refused",
    validatePractice({ ...good, routineId: "nope", routineStep: 1 }) !== null);
  check("a malformed session id is refused",
    validatePractice({ ...good, routineId, routineStep: 2, sessionId: "nope" }) !== null);
}

console.log("\n26. Kapalabhati pumps, rests, and is counted in rounds");
{
  const c = buildCycle(KAPALABHATI);
  check("one round is a minute", c.seconds === 60, `${c.seconds}`);
  check("two phases, not forty", c.phases.length === 2, `${c.phases.length}`);

  const pump = c.phases[0];
  const rest = c.phases[1];
  check("the pump phase knows its tempo and its count",
    pump.rate === 1 && pump.pumps === 20, `${pump.rate} / ${pump.pumps}`);
  check("a rest has no tempo", rest.rate === 0 && rest.pumps === 0);
  check("a round is twenty breaths", c.breaths === 20, `${c.breaths}`);
  check("default labels", pump.label === "Pump" && rest.label === "Rest");

  const at = (t: number) => positionAt(c, 3, t);
  // One pump a second, starting with the sharp exhale: high at the top of each
  // second, lowest half way through it.
  check("a pump starts high", near(at(0).size, 0.5), `${at(0).size}`);
  check("and snaps down by the half second", near(at(0.5).size, 0.22), `${at(0.5).size}`);
  check("and is back up a second later", near(at(1).size, 0.5), `${at(1).size}`);
  check("the second pump dips too", near(at(1.5).size, 0.22), `${at(1.5).size}`);
  check("pumps are counted as they happen",
    pumpAt(pump, 0) === 1 && pumpAt(pump, 0.9) === 1 && pumpAt(pump, 1) === 2 && pumpAt(pump, 11.4) === 12,
    `${pumpAt(pump, 0)}, ${pumpAt(pump, 1)}, ${pumpAt(pump, 11.4)}`);
  check("the count never runs past the round", pumpAt(pump, 19.99) === 20, `${pumpAt(pump, 19.99)}`);
  check("nothing else pumps", pumpAt(rest, 5) === 0);

  // The rest eases from where the pumping left the orb down to a resting size
  // and settles there. It is still easing in the final tenth of a second, so
  // "settled" is a millimetre, not an exact equality.
  check("the rest begins where the pumping ended",
    at(20).phase.kind === "rest" && near(at(20).size, 0.5), `${at(20).size}`);
  check("and eases down without ever rising",
    at(20).size > at(30).size && at(30).size > at(40).size && at(40).size > at(50).size,
    [20, 30, 40, 50].map((t) => at(t).size.toFixed(3)).join(" > "));
  check("and has settled by the end of it", near(at(59.9).size, 0.32, 1e-3), `${at(59.9).size}`);
  check("round two starts pumping again",
    at(60).cycleIndex === 1 && at(60).phase.kind === "pump" && near(at(60).size, 0.5));
  check("a pump is not paced as a hold", pump.from === pump.to && near(pump.to, 0.5));

  // Rounds, not minutes and not breaths: "3 min" and "60 breaths" are both
  // true of three rounds, and neither is how anyone chooses to do it.
  const plan = lengthPlan(c, 3);
  check("chosen in rounds", plan.unit === "rounds", plan.unit);
  check("one option per round, capped",
    plan.options.map((o) => o.label).join(", ") === "1 round, 2 rounds, 3 rounds",
    plan.options.map((o) => o.label).join(", "));
  check("no custom length", plan.maxMinutes === null);
  check("labelled in rounds", lengthLabel(c, 2, 3) === "2 rounds", lengthLabel(c, 2, 3));
  check("its own count is the starting length",
    initialCycles({ cycle: c, maxCycles: 3, defaultCycles: 3, preferredMinutes: 10, lastCycles: null }) === 3);
  check("what you did last time still wins",
    initialCycles({ cycle: c, maxCycles: 3, defaultCycles: 3, preferredMinutes: 10, lastCycles: 1 }) === 1);
  check("an uncapped pumping pattern is still offered in rounds",
    lengthPlan(buildCycle(KAPALABHATI), null).options.length === 5);

  // The engine's other guarantees still hold for it.
  const next = nextPhaseStart(c, 3, 5);
  check("the phase after the pumping is the rest",
    next !== null && next.at === 20 && next.phase.kind === "rest", `${next?.at}`);
  check("a URL cannot ask for a fourth round",
    parseSessionSearch({ cycles: "9" }, DEFAULT_PREFS, {
      fallbackCycles: 3, maxCycles: 3, cycleSeconds: c.seconds,
    }).cycles === 3);
}

console.log("\n27. The new phase kinds are parsed, and stay ours");
{
  const raw = [
    { kind: "pump", seconds: 20, rate: 1, cue: "Sharp out", label: "Pump" },
    { kind: "rest", seconds: 40, cue: "Breathe normally" },
  ];
  const parsed = parsePhases(raw);
  check("a pumping pattern parses", parsed !== null && parsed.length === 2);
  check("the rate survives", parsed?.[0].rate === 1, `${parsed?.[0].rate}`);
  check("a pumping pattern needs no inhale or exhale", parsed !== null);
  check("an absurd rate is dropped rather than trusted",
    parsePhases([{ ...raw[0], rate: 40 }, raw[1]])?.[0].rate === undefined);
  check("a rate on a phase that does not pump is ignored",
    parsePhases([{ kind: "inhale", seconds: 4, cue: "In", rate: 3 }, { kind: "exhale", seconds: 4, cue: "Out" }])?.[0].rate === undefined);
  check("a rest alone is still not a pattern", parsePhases([raw[1]]) === null);
  check("an unknown kind is still refused",
    parsePhases([{ kind: "gasp", seconds: 4, cue: "Gasp" }, raw[1]]) === null);

  // A practice you build yourself stays the four-slot shape.
  check("you cannot save a pump of your own",
    validatePatternDraft({ name: "Mine", phases: raw as BreathPhase[] }) !== null);
  check("nor a rest",
    validatePatternDraft({
      name: "Mine",
      phases: [
        { kind: "inhale", seconds: 4, cue: "In" },
        { kind: "rest", seconds: 4, cue: "Rest" },
        { kind: "exhale", seconds: 4, cue: "Out" },
      ] as BreathPhase[],
    }) !== null);

  check("a pumping practice is the one that asks first", needsConfirming(parsed as BreathPhase[]));
  check("an ordinary practice does not", !needsConfirming(BOX));

  // The gate is remembered as a preference, and only as a boolean.
  check("the acknowledgement is a preference", validatePrefs({ kapalabhatiAck: true }) === null);
  check("and only a boolean", validatePrefs({ kapalabhatiAck: "yes" as never }) !== null);

  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260916090000_breathe_kapalabhati.sql"), "utf8");
  const block = sql.match(/'(\[[\s\S]*?\])'::jsonb/);
  check("the seeded phases parse", block !== null && parsePhases(JSON.parse(block[1])) !== null);
  check("and are the ones tested here",
    block !== null && JSON.stringify(parsePhases(JSON.parse(block[1]))) === JSON.stringify(parsePhases(KAPALABHATI)),
    block ? JSON.stringify(parsePhases(JSON.parse(block[1]))) : "");
}

console.log("\n28. A routine cannot smuggle a gated practice past its confirmation");
{
  const patterns: Pattern[] = [
    fakePattern("coherent-breathing", "Coherent Breathing", COHERENT),
    fakePattern("kapalabhati", "Kapalabhati", KAPALABHATI, 3),
  ];
  check("a routine of ordinary practices resolves",
    resolveRoutine(fakeRoutine([
      { slug: "coherent-breathing", minutes: 1 },
      { slug: "coherent-breathing", minutes: 1 },
    ]), patterns) !== null);
  check("one containing Kapalabhati does not",
    resolveRoutine(fakeRoutine([
      { slug: "coherent-breathing", minutes: 1 },
      { slug: "kapalabhati", cycles: 1 },
    ]), patterns) === null);
}

console.log("\n29. Every practice's shape, and the fallback for anything else");
{
  check("the six shapes are accepted",
    (["orb", "square", "lobes", "teardrop", "ripple", "pulse"] as const).every((s) => asShape(s) === s));
  check("an unknown shape falls back to the circle", asShape("hexagon") === "orb");
  check("so does a missing one", asShape(null) === "orb" && asShape(undefined) === "orb");
  check("and one of the wrong type", asShape(7) === "orb");

  // A practice of your own is whatever you made it, so it gets the circle
  // rather than a silhouette claiming something about its shape.
  check("your own practice is a circle",
    patternFromUser({ id: uuid(), basePatternId: null, name: "Mine", phases: COHERENT }).shape === "orb");

  // The migration is the source of truth for which practice looks like what.
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260917090000_breathe_shapes.sql"), "utf8");
  const assigned = new Map<string, string>();
  for (const m of sql.matchAll(/set shape = '(\w+)'\s+where slug (?:=|in) \(?([^;]+?)\)?;/g)) {
    for (const slug of m[2].split(",")) assigned.set(slug.trim().replace(/'/g, ""), m[1]);
  }
  check("the box is a square", assigned.get("box-breathing") === "square", `${assigned.get("box-breathing")}`);
  check("both long exhales are teardrops",
    assigned.get("four-seven-eight") === "teardrop" && assigned.get("physiological-sigh") === "teardrop");
  check("both alternate-nostril practices are lobes",
    assigned.get("nadi-shodhana") === "lobes" && assigned.get("anulom-vilom") === "lobes");
  check("the hum ripples", assigned.get("bhramari") === "ripple");
  check("Kapalabhati pulses", assigned.get("kapalabhati") === "pulse");
  check("only the declared shapes are used",
    [...assigned.values()].every((s) => asShape(s) === s), [...assigned.values()].join(","));
  check("the smooth ones are left alone, so they keep the circle",
    !assigned.has("coherent-breathing") && !assigned.has("ujjayi") && !assigned.has("sheetali") && !assigned.has("extended-exhale"));
}

console.log("\n30. The course: its days parse, and each one reads in its own unit");
{
  const good = [
    { slug: "physiological-sigh", cycles: 6, title: "A", teaches: "a" },
    { slug: "coherent-breathing", minutes: 3, title: "B", teaches: "b" },
    { pick: "best", slug: "coherent-breathing", minutes: 5, title: "C", teaches: "c" },
  ];
  check("a well-formed course parses", parseDays(good)?.length === 3);
  check("and the chosen day keeps its rule", parseDays(good)?.[2].pick === "best");
  check("a day with no title is refused",
    parseDays([{ slug: "a", cycles: 1, teaches: "x" }, ...good]) === null);
  check("a day with no sentence about what it teaches is refused",
    parseDays([{ slug: "a", cycles: 1, title: "x" }, ...good]) === null);
  check("a day with both units is refused",
    parseDays([{ slug: "a", cycles: 1, minutes: 1, title: "x", teaches: "y" }, ...good]) === null);
  check("a day with neither is refused",
    parseDays([{ slug: "a", title: "x", teaches: "y" }, ...good]) === null);
  // An unknown rule must not quietly become an ordinary day on the fallback.
  check("an unknown rule is refused",
    parseDays([{ pick: "worst", slug: "a", minutes: 1, title: "x", teaches: "y" }, ...good]) === null);
  check("a course of two days is refused", parseDays(good.slice(0, 2)) === null);
  check("so is one longer than the cap",
    parseDays(Array.from({ length: MAX_DAYS + 1 }, () => good[0])) === null);
  check("and anything that is not an array", parseDays({ days: good }) === null);

  const patterns = [
    fakePattern("physiological-sigh", "Physiological Sigh", SIGH),
    fakePattern("coherent-breathing", "Coherent Breathing", COHERENT),
    fakePattern("bhramari", "Bhramari", BHRAMARI),
    fakePattern("kapalabhati", "Kapalabhati", KAPALABHATI, 3),
  ];
  const journey: Journey = {
    id: uuid(), slug: "foundations", name: "Breath foundations", subtitle: "Seven days",
    description: "…", about: null,
    days: parseDays(good) as JourneyDay[],
  };
  const resolved = resolveJourney({
    journey, patterns, today: "2026-09-12",
    progress: { daysCompleted: 1, startedOn: "2026-09-11", lastDayOn: "2026-09-11", completed: false },
  });
  check("every day resolves to a practice", resolved?.days.length === 3);
  // The same trap the routine steps had: a day asked for in breaths must not
  // be reported in seconds just because its practice has no cap.
  check("a day counted in breaths says breaths", resolved?.days[0].label === "6 breaths",
    resolved?.days[0].label);
  check("a day paced in minutes says minutes", resolved?.days[1].label.includes("min") === true,
    resolved?.days[1].label);
  check("the day behind you is done", resolved?.days[0].state === "done");
  check("the next one is open today", resolved?.days[1].state === "today");
  check("the one after that is still ahead", resolved?.days[2].state === "ahead");
  check("and the open one is the one Start runs", resolved?.today?.number === 2);
  check("a course missing a practice is not offered",
    resolveJourney({
      journey, patterns: patterns.filter((p) => p.slug !== "coherent-breathing"),
      today: "2026-09-12", progress: NO_PROGRESS,
    }) === null);

  // One a day. This is the whole difference between a seven-day course and a
  // list you could get through in an afternoon.
  const sameDay = resolveJourney({
    journey, patterns, today: "2026-09-12",
    progress: { daysCompleted: 1, startedOn: "2026-09-12", lastDayOn: "2026-09-12", completed: false },
  });
  check("a day already counted today closes the next one", sameDay?.days[1].state === "tomorrow");
  check("so there is nothing to start", sameDay?.today === null);

  const finished = resolveJourney({
    journey, patterns, today: "2026-09-12",
    progress: { daysCompleted: 3, startedOn: "2026-09-09", lastDayOn: "2026-09-11", completed: true },
  });
  check("a finished course has every day done",
    finished?.days.every((d) => d.state === "done") === true);
  check("and nothing left to start", finished?.today === null);

  check("the line reads for a fresh course", dayLine(0, 7) === "7 days");
  check("and part-way through", dayLine(3, 7) === "Day 3 of 7 done");
  check("and at the end", dayLine(7, 7) === "Finished");
}

console.log("\n31. The last day is chosen from your own check-ins");
{
  const patterns = [
    fakePattern("coherent-breathing", "Coherent Breathing", COHERENT),
    fakePattern("bhramari", "Bhramari", BHRAMARI),
    fakePattern("kapalabhati", "Kapalabhati", KAPALABHATI, 3),
  ];
  const shift = (patternName: string, averageAfter: number, practices = 2): CalmShift => ({
    patternName, practices, averageAfter, averageShift: 1,
  });

  check("the highest average afterwards wins",
    bestRated([shift("Coherent Breathing", 3.5), shift("Bhramari", 4.8)], patterns)?.slug === "bhramari");
  check("a tie goes to the one done more often",
    bestRated([shift("Bhramari", 4, 2), shift("Coherent Breathing", 4, 9)], patterns)?.slug ===
      "coherent-breathing");
  // A course must never hand someone Kapalabhati: the confirmation exists
  // precisely so that practice is never reached without a deliberate tap.
  check("the gated practice is never chosen, however well it rates",
    bestRated([shift("Kapalabhati", 5), shift("Bhramari", 3)], patterns)?.slug === "bhramari");
  // Check-ins group a routine under the routine's name, which matches no
  // practice and must simply drop out.
  check("a routine's name matches nothing and is ignored",
    bestRated([shift("Downshift", 5), shift("Bhramari", 3)], patterns)?.slug === "bhramari");
  check("no check-ins means no answer", bestRated([], patterns) === null);

  const day: JourneyDay = {
    pick: "best", slug: "coherent-breathing", minutes: 2,
    title: "The one that works on you", teaches: "…",
  };
  const journey: Journey = {
    id: uuid(), slug: "foundations", name: "Breath foundations", subtitle: null,
    description: "…", about: null,
    days: [
      { slug: "coherent-breathing", minutes: 1, title: "A", teaches: "a" },
      { slug: "bhramari", minutes: 1, title: "B", teaches: "b" },
      day,
    ],
  };
  const args = { journey, patterns, today: "2026-09-12", progress: NO_PROGRESS };

  const chosen = resolveJourney({ ...args, shifts: [shift("Bhramari", 4.8)] });
  check("the chosen day runs the practice your check-ins rate best",
    chosen?.days[2].pattern.slug === "bhramari", chosen?.days[2].pattern.slug);
  check("and says why", chosen?.days[2].chosenBecause === "Your check-ins rate Bhramari highest.");

  const unrated = resolveJourney(args);
  check("with no check-ins it falls back to the day's own practice",
    unrated?.days[2].pattern.slug === "coherent-breathing");
  check("and claims no reason it does not have", unrated?.days[2].chosenBecause === null);
  // The fallback is a real practice, so the course still resolves for someone
  // who has never answered a check-in. That is most people on day one.
  check("so a brand new course is still offered", unrated !== null);
}

console.log("\n32. The seeded course matches the practices that exist");
{
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260918090000_breathe_journey.sql"),
    "utf8",
  );
  const json = sql.match(/'(\[[\s\S]*?\])'::jsonb/)?.[1];
  const days = parseDays(JSON.parse(json ?? "null"));
  check("the seeded days parse", days?.length === 7, `${days?.length}`);
  check("day one is the sigh, as the spec says",
    days?.[0].slug === "physiological-sigh", days?.[0].slug);
  check("day seven is chosen from your check-ins", days?.[6].pick === "best");
  check("and every other day is not", days?.slice(0, 6).every((d) => d.pick === undefined) === true);
  check("every day teaches something in a sentence",
    days?.every((d) => d.teaches.length > 20 && d.title.length > 3) === true);

  // Every slug must be a practice that is actually seeded, or the whole course
  // hides itself. The pattern migrations are the list.
  const seeded = new Set<string>();
  for (const file of [
    "20260908090200_seed_reference_data.sql",
    "20260914090000_breathe_your_own.sql",
    "20260916090000_breathe_kapalabhati.sql",
  ]) {
    const text = readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8");
    // Only the practice insert, so an unrelated tuple elsewhere in the file
    // cannot make a missing slug look present. Bounded by `on conflict` rather
    // than by the statement's semicolon, because two of the descriptions
    // contain one.
    const from = text.indexOf("insert into breathing_patterns");
    const block = text.slice(from, text.indexOf("on conflict", from));
    for (const m of block.matchAll(/^\s*\('([a-z-]+)', '/gm)) seeded.add(m[1]);
  }
  check("all eleven practices were found", seeded.size === 11, [...seeded].join(","));
  check("every day names a practice that exists",
    days?.every((d) => seeded.has(d.slug)) === true,
    days?.map((d) => d.slug).filter((s) => !seeded.has(s)).join(","));
  check("and none of them is the gated one",
    days?.every((d) => d.slug !== "kapalabhati") === true);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
