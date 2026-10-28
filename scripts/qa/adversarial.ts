import { evaluateProgression, estimateOneRepMax, type ExerciseMeta, type ProgressState } from "../../src/lib/program/progression";

const meta: ExerciseMeta = {
  mechanic: "compound", movementPattern: "horizontal_press", metric: "reps",
  isBodyweight: false, progressionChain: null, progressionRank: null,
};
const state = (o: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60, currentTargetReps: 12, consecutiveFailures: 0,
  bestWeightKg: 60, bestReps: 12, bestE1rm: 84, totalSessions: 5, weightAtFailureStartKg: null, ...o,
});
const run = (label: string, sets: {reps:number|null;weightKg:number|null}[], st = state()) => {
  const d = evaluateProgression({ sets, plannedSets: 4, repsMin: 8, repsMax: 12,
    feel: null, meta, state: st, isDeload: false });
  console.log(`\n${label}`);
  console.log(`  outcome=${d.outcome}  nextWeight=${d.nextWorkingWeightKg}  nextReps=${d.nextTargetReps}`);
  console.log(`  bestWeight=${d.bestWeightKg}  bestReps=${d.bestReps}  bestE1rm=${d.bestE1rm?.toFixed(1)}`);
  console.log(`  failures=${d.consecutiveFailures}`);
  console.log(`  "${d.message}"`);
};

console.log("=".repeat(72));
console.log("A. User taps 'Log set' 4x without touching the inputs (reps prefilled 12)");
run("   4 x 12 @ 60kg (all defaults)", Array(4).fill({reps:12, weightKg:60}));

console.log("\n" + "=".repeat(72));
console.log("B. One stray 0-rep set among four");
run("   3 real sets + one 0-rep", [
  {reps:12,weightKg:60},{reps:12,weightKg:60},{reps:12,weightKg:60},{reps:0,weightKg:60}]);
run("   ...and the same thing again next session (failures already 1)",
  [{reps:12,weightKg:60},{reps:12,weightKg:60},{reps:12,weightKg:60},{reps:0,weightKg:60}],
  state({consecutiveFailures:1}));

console.log("\n" + "=".repeat(72));
console.log("C. Negative weight typed by mistake");
run("   4 x 12 @ -50kg, no prior working weight",
  Array(4).fill({reps:12, weightKg:-50}), state({currentWorkingWeightKg:null, bestWeightKg:null, bestE1rm:null}));

console.log("\n" + "=".repeat(72));
console.log("D. Fat-fingered rep count");
run("   4 x 999 @ 60kg", Array(4).fill({reps:999, weightKg:60}));
console.log(`   estimateOneRepMax(60, 999) = ${estimateOneRepMax(60,999).toFixed(1)} kg`);
console.log(`   (now capped at 12 reps: ${estimateOneRepMax(60,12).toFixed(1)} kg - same value)`);

console.log("\n" + "=".repeat(72));
console.log("E. AFTER THE FIX");
console.log("   The reps field is now empty on the first set of an exercise and");
console.log("   must be typed; later sets carry forward what was actually entered.");
console.log("   So neither of these outcomes can be reached by tapping through.");
run("   4 x 8 @ 60kg (a real set of eights)", Array(4).fill({reps:8, weightKg:60}));
console.log("   ^ honest hold: eights are not the top of an 8-12 range.");
run("   4 x 12 @ 60kg (a real top-of-range session)", Array(4).fill({reps:12, weightKg:60}));
console.log("   ^ a genuine top-of-range session still progresses.");
console.log("\n   0 reps, 999 reps and negative weights are now rejected before");
console.log("   they reach the database, by the input, the server action and a");
console.log("   CHECK constraint, so cases B, C and D above are unreachable.");
