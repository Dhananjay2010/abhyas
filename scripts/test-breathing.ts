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
  type BreathPhase,
} from "../src/lib/breathing/engine";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PausableClock } from "../src/lib/breathing/clock";
import { breathingStats } from "../src/lib/breathing/stats";
import {
  DEFAULT_PREFS,
  parsePhases,
  parseSessionSearch,
  sessionSearch,
} from "../src/lib/breathing/pattern";
import { validatePractice, validatePrefs } from "../src/lib/breathing/validation";
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
  check("under a minute reads in seconds", lengthLabel(buildCycle(SIGH), 2, null) === "18 sec");
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
    cycles: 4, plannedCycles: 4, breaths: 4, seconds: 64,
    endedEarly: false, moodBefore: null, guidance: "tones" as const,
  };
  check("a normal practice passes", validatePractice(good) === null);
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

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
