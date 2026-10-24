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
  const barbellToPullUp = swappedEntryFields({ equipmentIds: ["pull_up_bar"] });
  check("barbell to pull-up bar gives isBodyweight true",
    barbellToPullUp.isBodyweight === true, `got ${barbellToPullUp.isBodyweight}`);

  // Pull-up bar to dumbbell gives false (loaded)
  const pullUpToDumbbell = swappedEntryFields({ equipmentIds: ["dumbbell"] });
  check("pull-up bar to dumbbell gives isBodyweight false",
    pullUpToDumbbell.isBodyweight === false, `got ${pullUpToDumbbell.isBodyweight}`);

  // Empty equipment list gives true (bodyweight)
  const emptyEquipment = swappedEntryFields({ equipmentIds: [] });
  check("empty equipment list gives isBodyweight true",
    emptyEquipment.isBodyweight === true, `got ${emptyEquipment.isBodyweight}`);

  // Dip bars (bodyweight support) gives true
  const dipBars = swappedEntryFields({ equipmentIds: ["dip_bars"] });
  check("dip bars gives isBodyweight true",
    dipBars.isBodyweight === true, `got ${dipBars.isBodyweight}`);

  // Flat bench only (bodyweight support) gives true
  const flatBench = swappedEntryFields({ equipmentIds: ["flat_bench"] });
  check("flat bench only gives isBodyweight true",
    flatBench.isBodyweight === true, `got ${flatBench.isBodyweight}`);

  // Mixed: pull-up bar + dumbbell gives false (loaded)
  const mixed = swappedEntryFields({ equipmentIds: ["pull_up_bar", "dumbbell"] });
  check("pull-up bar + dumbbell gives isBodyweight false",
    mixed.isBodyweight === false, `got ${mixed.isBodyweight}`);

  // Cable machine gives false (loaded)
  const cable = swappedEntryFields({ equipmentIds: ["cable_machine"] });
  check("cable machine gives isBodyweight false",
    cable.isBodyweight === false, `got ${cable.isBodyweight}`);

  // Barbell gives false (loaded)
  const barbell = swappedEntryFields({ equipmentIds: ["barbell"] });
  check("barbell gives isBodyweight false",
    barbell.isBodyweight === false, `got ${barbell.isBodyweight}`);
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
  check("mutation guard: exact copy 'No safe swap for this one. You can skip it.'",
    emptyState.message === expectedCopy,
    `got "${emptyState.message}"`);

  // Test that Skip button appears only when empty (will fail if condition is mutated)
  const emptyShowsSkip = swapSheetState({ alternatives: [] });
  check("mutation guard: empty list shows Skip button",
    emptyShowsSkip.showSkipButton === true && emptyShowsSkip.isEmpty === true,
    `isEmpty=${emptyShowsSkip.isEmpty}, showSkipButton=${emptyShowsSkip.showSkipButton}`);

  const nonEmptyHidesSkip = swapSheetState({ alternatives: [{ id: 1 }] });
  check("mutation guard: non-empty list hides Skip button",
    nonEmptyHidesSkip.showSkipButton === false && nonEmptyHidesSkip.isEmpty === false,
    `isEmpty=${nonEmptyHidesSkip.isEmpty}, showSkipButton=${nonEmptyHidesSkip.showSkipButton}`);

  // Test coupling: showSkipButton must match isEmpty
  const emptyStateCoupled = swapSheetState({ alternatives: [] });
  check("mutation guard: showSkipButton === isEmpty when empty",
    emptyStateCoupled.showSkipButton === emptyStateCoupled.isEmpty,
    `isEmpty=${emptyStateCoupled.isEmpty}, showSkipButton=${emptyStateCoupled.showSkipButton}`);

  const nonEmptyStateCoupled = swapSheetState({ alternatives: [{ id: 1 }] });
  check("mutation guard: showSkipButton === isEmpty when non-empty",
    nonEmptyStateCoupled.showSkipButton === nonEmptyStateCoupled.isEmpty,
    `isEmpty=${nonEmptyStateCoupled.isEmpty}, showSkipButton=${nonEmptyStateCoupled.showSkipButton}`);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
