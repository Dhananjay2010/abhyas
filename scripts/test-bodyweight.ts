/**
 * Tests bodyweight equipment classification.
 *
 *   npx tsx scripts/test-bodyweight.ts
 */
import { isBodyweightEquipment } from "../src/lib/program/bodyweight";
import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nBodyweight equipment classification");
check("[] is bodyweight", isBodyweightEquipment([]), "true");
check("null is bodyweight", isBodyweightEquipment(null), "true");
check("undefined is bodyweight", isBodyweightEquipment(undefined), "true");

check("['pull_up_bar'] is bodyweight", isBodyweightEquipment(["pull_up_bar"]), "true");
check("['dip_bars'] is bodyweight", isBodyweightEquipment(["dip_bars"]), "true");
check("['flat_bench'] is bodyweight", isBodyweightEquipment(["flat_bench"]), "true");
check("['adjustable_bench'] is bodyweight", isBodyweightEquipment(["adjustable_bench"]), "true");
check("['stability_ball'] is bodyweight", isBodyweightEquipment(["stability_ball"]), "true");
check(
  "['pull_up_bar','dip_bars'] is bodyweight",
  isBodyweightEquipment(["pull_up_bar", "dip_bars"]),
  "true",
);

check("['flat_bench','dumbbell'] is NOT bodyweight", !isBodyweightEquipment(["flat_bench", "dumbbell"]), "false");
check("['barbell'] is NOT bodyweight", !isBodyweightEquipment(["barbell"]), "false");
check("['cable_machine'] is NOT bodyweight", !isBodyweightEquipment(["cable_machine"]), "false");
check("['dumbbell'] is NOT bodyweight", !isBodyweightEquipment(["dumbbell"]), "false");
check("['pull_up_bar','cable_machine'] is NOT bodyweight", !isBodyweightEquipment(["pull_up_bar", "cable_machine"]), "false");

console.log("\nPull-ups and dips with added weight follow bodyweight rules");
{
  const PULLUP: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "vertical_pull",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
    equipmentIds: [],
  };

  const fresh = (): ProgressState => ({
    currentWorkingWeightKg: 10,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 10,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 1,
  });

  const sets = (n: number, reps: number, w: number) =>
    Array.from({ length: n }, () => ({ reps, weightKg: w }));

  const run = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
    evaluateProgression({
      sets: sets(4, 12, 10),
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: PULLUP,
      state: fresh(),
      isDeload: false,
      ...over,
    });

  // A pull-up at 10 kg that felt easy should go to 11.25 kg (10 + 1.25), NOT 15 kg (10 + 5).
  const easyPullup = run({ feel: "easy" });
  check("pull-up 10 kg with 'easy' goes to 11.25 kg",
    easyPullup.nextWorkingWeightKg === 11.25, `${easyPullup.nextWorkingWeightKg}`);
  check("NOT 15 kg with old incrementFor", easyPullup.nextWorkingWeightKg !== 15);
  check("NOT doubled when easy", easyPullup.nextWorkingWeightKg !== 12.5);

  // A normal pull-up at 10 kg should go to 11.25 kg (10 + 1.25).
  const normalPullup = run({ feel: "right" });
  check("pull-up 10 kg normal goes to 11.25 kg",
    normalPullup.nextWorkingWeightKg === 11.25, `${normalPullup.nextWorkingWeightKg}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
