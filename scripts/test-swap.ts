import { swappedEntryFields } from "../src/lib/session/swap";

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

if (failures > 0) {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
