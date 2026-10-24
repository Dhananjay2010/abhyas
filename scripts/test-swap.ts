import { swappedEntryFields, swapSheetState } from "../src/lib/session/swap";

let failures = 0;

function check(label: string, pass: boolean, ...extra: unknown[]) {
  if (pass) {
    console.log(`  ok   ${label}`, extra.length ? ` -- ${extra.join(", ")}` : "");
  } else {
    console.log(`  FAIL ${label}`, extra.length ? ` -- ${extra.join(", ")}` : "");
    failures++;
  }
}

console.log("Swapped exercise entry fields: isBodyweight from equipment");
{
  // Barbell to pull-up bar gives true (bodyweight)
  const barbellToPullUp = swappedEntryFields({
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("barbell to pull-up bar gives isBodyweight true",
    barbellToPullUp.isBodyweight === true, `got ${barbellToPullUp.isBodyweight}`);

  // Pull-up bar to dumbbell gives false (loaded)
  const pullUpToDumbbell = swappedEntryFields({
    equipmentIds: ["dumbbell"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("pull-up bar to dumbbell gives isBodyweight false",
    pullUpToDumbbell.isBodyweight === false, `got ${pullUpToDumbbell.isBodyweight}`);

  // Empty equipment list gives true (bodyweight)
  const emptyEquipment = swappedEntryFields({
    equipmentIds: [],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("empty equipment list gives isBodyweight true",
    emptyEquipment.isBodyweight === true, `got ${emptyEquipment.isBodyweight}`);

  // Dip bars (bodyweight support) gives true
  const dipBars = swappedEntryFields({
    equipmentIds: ["dip_bars"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("dip bars gives isBodyweight true",
    dipBars.isBodyweight === true, `got ${dipBars.isBodyweight}`);

  // Flat bench only (bodyweight support) gives true
  const flatBench = swappedEntryFields({
    equipmentIds: ["flat_bench"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("flat bench only gives isBodyweight true",
    flatBench.isBodyweight === true, `got ${flatBench.isBodyweight}`);

  // Mixed: pull-up bar + dumbbell gives false (loaded)
  const mixed = swappedEntryFields({
    equipmentIds: ["pull_up_bar", "dumbbell"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("pull-up bar + dumbbell gives isBodyweight false",
    mixed.isBodyweight === false, `got ${mixed.isBodyweight}`);

  // Cable machine gives false (loaded)
  const cable = swappedEntryFields({
    equipmentIds: ["cable_machine"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("cable machine gives isBodyweight false",
    cable.isBodyweight === false, `got ${cable.isBodyweight}`);

  // Barbell gives false (loaded)
  const barbell = swappedEntryFields({
    equipmentIds: ["barbell"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("barbell gives isBodyweight false",
    barbell.isBodyweight === false, `got ${barbell.isBodyweight}`);
}

console.log("\nSwapped exercise weight reset: swapping clears old weights");
{
  // Barbell 60 kg to pull-up bar gives null weights (bodyweight swap)
  const barbellToPullUp = swappedEntryFields({
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("barbell 60 kg to pull-up bar: workingWeightKg is null",
    barbellToPullUp.workingWeightKg === null, `got ${barbellToPullUp.workingWeightKg}`);
  check("barbell 60 kg to pull-up bar: suggestedWeightKg is null",
    barbellToPullUp.suggestedWeightKg === null, `got ${barbellToPullUp.suggestedWeightKg}`);

  // Barbell 60 kg to another exercise with its own progress (e.g., 40 kg working, 40 kg suggested)
  const barbellToOtherLoaded = swappedEntryFields({
    equipmentIds: ["dumbbell"],
    workingWeightKg: 40,
    suggestedWeightKg: 40,
  });
  check("barbell 60 kg to exercise with 40 kg progress: workingWeightKg is 40",
    barbellToOtherLoaded.workingWeightKg === 40, `got ${barbellToOtherLoaded.workingWeightKg}`);
  check("barbell 60 kg to exercise with 40 kg progress: suggestedWeightKg is 40",
    barbellToOtherLoaded.suggestedWeightKg === 40, `got ${barbellToOtherLoaded.suggestedWeightKg}`);

  // Bodyweight exercise with added weight (e.g., 10 kg) to another bodyweight (no progress)
  const bodyweightToBodyweight = swappedEntryFields({
    equipmentIds: [],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("bodyweight 10 kg to bodyweight with no progress: workingWeightKg is null",
    bodyweightToBodyweight.workingWeightKg === null, `got ${bodyweightToBodyweight.workingWeightKg}`);
  check("bodyweight 10 kg to bodyweight with no progress: suggestedWeightKg is null",
    bodyweightToBodyweight.suggestedWeightKg === null, `got ${bodyweightToBodyweight.suggestedWeightKg}`);

  // Loaded to bodyweight with added weight progress (e.g., 5 kg added)
  const loadedToBodyweightWithProgress = swappedEntryFields({
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: 5,
    suggestedWeightKg: 5,
  });
  check("loaded to bodyweight with 5 kg progress: workingWeightKg is 5",
    loadedToBodyweightWithProgress.workingWeightKg === 5, `got ${loadedToBodyweightWithProgress.workingWeightKg}`);
  check("loaded to bodyweight with 5 kg progress: suggestedWeightKg is 5",
    loadedToBodyweightWithProgress.suggestedWeightKg === 5, `got ${loadedToBodyweightWithProgress.suggestedWeightKg}`);
}

console.log("\nSwap sheet state: empty list detection and Skip button");
{
  // Empty alternatives list
  const empty = swapSheetState({ alternatives: [] });
  check("empty list: isEmpty is true",
    empty.isEmpty === true, `got ${empty.isEmpty}`);
  check("empty list: message is exact copy",
    empty.message === "No safe swap for this one. You can skip it.",
    `got "${empty.message}"`);
  check("empty list: showSkipButton is true",
    empty.showSkipButton === true, `got ${empty.showSkipButton}`);

  // Non-empty alternatives list
  const nonEmpty = swapSheetState({ alternatives: [{ id: 1 }, { id: 2 }] });
  check("non-empty list: isEmpty is false",
    nonEmpty.isEmpty === false, `got ${nonEmpty.isEmpty}`);
  check("non-empty list: message is empty string",
    nonEmpty.message === "", `got "${nonEmpty.message}"`);
  check("non-empty list: showSkipButton is false",
    nonEmpty.showSkipButton === false, `got ${nonEmpty.showSkipButton}`);

  // Single alternative
  const single = swapSheetState({ alternatives: [{ id: 1 }] });
  check("single alternative: isEmpty is false",
    single.isEmpty === false, `got ${single.isEmpty}`);
  check("single alternative: showSkipButton is false",
    single.showSkipButton === false, `got ${single.showSkipButton}`);
}

console.log("\nMutation tests: copy and Skip button condition must not change");
{
  // Test that the exact copy is enforced (will fail if mutated)
  const emptyState = swapSheetState({ alternatives: [] });
  const expectedCopy = "No safe swap for this one. You can skip it.";
  check("exact copy 'No safe swap for this one. You can skip it.'",
    emptyState.message === expectedCopy,
    `got "${emptyState.message}"`);

  // Test that Skip button appears only when empty
  const emptyShowsSkip = swapSheetState({ alternatives: [] });
  check("empty list shows Skip button",
    emptyShowsSkip.showSkipButton === true && emptyShowsSkip.isEmpty === true,
    `isEmpty=${emptyShowsSkip.isEmpty}, showSkipButton=${emptyShowsSkip.showSkipButton}`);

  const nonEmptyHidesSkip = swapSheetState({ alternatives: [{ id: 1 }] });
  check("non-empty list hides Skip button",
    nonEmptyHidesSkip.showSkipButton === false && nonEmptyHidesSkip.isEmpty === false,
    `isEmpty=${nonEmptyHidesSkip.isEmpty}, showSkipButton=${nonEmptyHidesSkip.showSkipButton}`);

  // Test coupling: showSkipButton must match isEmpty
  const emptyStateCoupled = swapSheetState({ alternatives: [] });
  check("showSkipButton === isEmpty when empty",
    emptyStateCoupled.showSkipButton === emptyStateCoupled.isEmpty,
    `isEmpty=${emptyStateCoupled.isEmpty}, showSkipButton=${emptyStateCoupled.showSkipButton}`);

  const nonEmptyStateCoupled = swapSheetState({ alternatives: [{ id: 1 }] });
  check("showSkipButton === isEmpty when non-empty",
    nonEmptyStateCoupled.showSkipButton === nonEmptyStateCoupled.isEmpty,
    `isEmpty=${nonEmptyStateCoupled.isEmpty}, showSkipButton=${nonEmptyStateCoupled.showSkipButton}`);
}

console.log("\nWiring tests: swap must update critical fields");
{
  // Test that swappedEntryFields returns isBodyweight correctly
  const bodyweightSwap = swappedEntryFields({
    equipmentIds: [],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("swappedEntryFields computes isBodyweight for empty equipment",
    bodyweightSwap.isBodyweight === true,
    "session-runner.tsx must apply isBodyweight from swappedFields on swap");

  const loadedSwap = swappedEntryFields({
    equipmentIds: ["barbell"],
    workingWeightKg: 60,
    suggestedWeightKg: 60,
  });
  check("swappedEntryFields computes isBodyweight false for loaded equipment",
    loadedSwap.isBodyweight === false,
    "session-runner.tsx must apply isBodyweight from swappedFields on swap");

  // Swap action must return equipmentIds
  const swapWithEquipment = swappedEntryFields({
    equipmentIds: ["dumbbell"],
    workingWeightKg: 20,
    suggestedWeightKg: 20,
  });
  check("swappedEntryFields receives equipmentIds",
    swapWithEquipment.isBodyweight === false,
    "session/actions.ts must return equipmentIds in SwapResult");

  // Swap must reset weights, not carry them over
  const weightResetSwap = swappedEntryFields({
    equipmentIds: ["pull_up_bar"],
    workingWeightKg: null,
    suggestedWeightKg: null,
  });
  check("swappedEntryFields accepts null weights (barbell to pull-up bar)",
    weightResetSwap.workingWeightKg === null && weightResetSwap.suggestedWeightKg === null,
    "session-runner.tsx must set workingWeightKg/suggestedWeightKg from swappedFields, not carry over old");

  const progressCarrySwap = swappedEntryFields({
    equipmentIds: ["dumbbell"],
    workingWeightKg: 40,
    suggestedWeightKg: 40,
  });
  check("swappedEntryFields carries new exercise's progress",
    progressCarrySwap.workingWeightKg === 40 && progressCarrySwap.suggestedWeightKg === 40,
    "session-runner.tsx must use new exercise's own working/suggested weights");
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
