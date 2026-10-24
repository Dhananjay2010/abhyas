/**
 * Tests for equipment ordering in onboarding.
 * Ensures bodyweight equipment appears first for home users.
 *
 *   npm run test:equipment-order
 */

import { orderEquipmentCategories } from "../src/lib/onboarding/equipment-order";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Equipment category ordering for home users");
{
  const categories = ["free_weight", "bodyweight", "machine", "accessory"];
  
  const homeOrder = orderEquipmentCategories(categories, "home");
  check(
    "Home: bodyweight comes first",
    homeOrder[0] === "bodyweight",
    `got ${JSON.stringify(homeOrder)}`
  );
  check(
    "Home: all categories present",
    homeOrder.length === categories.length &&
    categories.every((c) => homeOrder.includes(c))
  );
  check(
    "Home: bodyweight only appears once",
    homeOrder.filter((c) => c === "bodyweight").length === 1
  );
  
  const gymOrder = orderEquipmentCategories(categories, "gym");
  check(
    "Gym: order unchanged",
    JSON.stringify(gymOrder) === JSON.stringify(categories),
    `got ${JSON.stringify(gymOrder)}`
  );
  
  const nullOrder = orderEquipmentCategories(categories, null);
  check(
    "null location: order unchanged",
    JSON.stringify(nullOrder) === JSON.stringify(categories)
  );
}

console.log("\n2. Edge cases");
{
  const noBodyweight = ["free_weight", "machine", "accessory"];
  const homeOrderNoBodyweight = orderEquipmentCategories(noBodyweight, "home");
  check(
    "Home without bodyweight: order unchanged",
    JSON.stringify(homeOrderNoBodyweight) === JSON.stringify(noBodyweight)
  );
  
  const onlyBodyweight = ["bodyweight"];
  const homeOrderOnly = orderEquipmentCategories(onlyBodyweight, "home");
  check(
    "Only bodyweight: returns as-is",
    JSON.stringify(homeOrderOnly) === JSON.stringify(onlyBodyweight)
  );
  
  const empty: string[] = [];
  const homeOrderEmpty = orderEquipmentCategories(empty, "home");
  check(
    "Empty array: returns empty",
    homeOrderEmpty.length === 0
  );
  
  const bodyweightFirst = ["bodyweight", "free_weight", "machine"];
  const homeOrderAlreadyFirst = orderEquipmentCategories(bodyweightFirst, "home");
  check(
    "Bodyweight already first: order preserved",
    JSON.stringify(homeOrderAlreadyFirst) === JSON.stringify(bodyweightFirst)
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
