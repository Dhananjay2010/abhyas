import { evaluateProgression, estimateOneRepMax, type ExerciseMeta, type ProgressState } from "../../src/lib/program/progression";

const meta: ExerciseMeta = {
  mechanic: "compound", movementPattern: "horizontal_push",
  isBodyweight: false, progressionChain: null, progressionRank: null,
};
const state = (o: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60, currentTargetReps: 12, consecutiveFailures: 0,
  bestWeightKg: 60, bestReps: 12, bestE1rm: 84, totalSessions: 5, ...o,
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
console.log(`   (the SQL chart caps reps at 12: ${estimateOneRepMax(60,12).toFixed(1)} kg)`);
