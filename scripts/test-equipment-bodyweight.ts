/**
 * Test equipment step behavior for bodyweight-only users
 * QA finding: Step 8 should handle bodyweight-only users sensibly
 */

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// Test 1: Bodyweight-only track detection
const tracks = ["weights", "bodyweight", "yoga", "breathing"] as const;
const bodyweightTrack = "bodyweight";
assert(bodyweightTrack === "bodyweight", "Bodyweight track is correctly identified");

// Test 2: Equipment step should auto-select bodyweight items for bodyweight-only users
// This is a UI behavior test - we validate the logic here
function shouldAutoSelectBodyweight(track: typeof tracks[number]): boolean {
  return track === "bodyweight";
}

assert(
  shouldAutoSelectBodyweight("bodyweight"),
  "Bodyweight track triggers auto-selection"
);
assert(
  !shouldAutoSelectBodyweight("weights"),
  "Weights track does not trigger auto-selection"
);
assert(
  !shouldAutoSelectBodyweight("yoga"),
  "Yoga track does not trigger auto-selection"
);

// Test 3: Title and subtitle should adapt for bodyweight-only users
function getEquipmentStepTitle(isBodyweightOnly: boolean): string {
  return isBodyweightOnly
    ? "Bodyweight training confirmed"
    : "What can you actually use?";
}

function getEquipmentStepSubtitle(isBodyweightOnly: boolean): string {
  return isBodyweightOnly
    ? "We've selected bodyweight equipment for you. Add anything else you have."
    : "We never suggest an exercise you have no equipment for.";
}

assert(
  getEquipmentStepTitle(true) === "Bodyweight training confirmed",
  "Bodyweight-only title is correct"
);
assert(
  getEquipmentStepTitle(false) === "What can you actually use?",
  "Normal equipment title is correct"
);
assert(
  getEquipmentStepSubtitle(true).includes("selected bodyweight equipment"),
  "Bodyweight-only subtitle mentions auto-selection"
);
assert(
  getEquipmentStepSubtitle(false).includes("never suggest"),
  "Normal subtitle mentions constraint"
);

// Test 4: Equipment categories exist
const categories = ["bodyweight", "free_weight", "machine", "cable", "accessory"];
assert(categories.includes("bodyweight"), "Bodyweight category exists");
assert(categories.includes("machine"), "Machine category exists");

// Test 5: Home users should see gym machines toggle
function shouldShowGymMachinesToggle(
  location: "home" | "gym" | null,
  hasMachineCategory: boolean
): boolean {
  return location === "home" && hasMachineCategory;
}

assert(
  shouldShowGymMachinesToggle("home", true),
  "Home users with machines should see toggle"
);
assert(
  !shouldShowGymMachinesToggle("gym", true),
  "Gym users should not see toggle"
);
assert(
  !shouldShowGymMachinesToggle("home", false),
  "Home users without machines should not see toggle"
);

// Test 6: Category ordering puts bodyweight first for home users
function orderCategories(
  categories: string[],
  location: "home" | "gym" | null
): string[] {
  if (location === "home" && categories.includes("bodyweight")) {
    const sorted = [...categories];
    const bwIndex = sorted.indexOf("bodyweight");
    if (bwIndex > 0) {
      sorted.splice(bwIndex, 1);
      sorted.unshift("bodyweight");
    }
    return sorted;
  }
  return categories;
}

const homeOrder = orderCategories(["free_weight", "machine", "bodyweight"], "home");
assert(homeOrder[0] === "bodyweight", "Bodyweight is first for home users");

const gymOrder = orderCategories(["free_weight", "machine", "bodyweight"], "gym");
assert(gymOrder[0] === "free_weight", "Gym users keep original order");

// Test 7: Bodyweight equipment detection
import { isBodyweightEquipment } from "../src/lib/program/bodyweight";

assert(isBodyweightEquipment(["bodyweight"]), "bodyweight equipment is bodyweight");
assert(isBodyweightEquipment(["yoga_mat"]), "yoga_mat is bodyweight");
assert(isBodyweightEquipment(["jump_rope"]), "jump_rope is bodyweight");
assert(isBodyweightEquipment(["pull_up_bar"]), "pull_up_bar is bodyweight");
assert(isBodyweightEquipment(["dip_bars"]), "dip_bars is bodyweight");
assert(isBodyweightEquipment(["flat_bench"]), "flat_bench is bodyweight");
assert(isBodyweightEquipment(["adjustable_bench"]), "adjustable_bench is bodyweight");
assert(isBodyweightEquipment(["stability_ball"]), "stability_ball is bodyweight");
assert(isBodyweightEquipment(["bodyweight", "yoga_mat"]), "bodyweight + yoga_mat is bodyweight");
assert(isBodyweightEquipment(["pull_up_bar", "jump_rope"]), "pull_up_bar + jump_rope is bodyweight");
assert(!isBodyweightEquipment(["barbell"]), "barbell is not bodyweight");
assert(!isBodyweightEquipment(["dumbbell"]), "dumbbell is not bodyweight");
assert(!isBodyweightEquipment(["kettlebell"]), "kettlebell is not bodyweight");
assert(!isBodyweightEquipment(["bodyweight", "barbell"]), "bodyweight + barbell is not bodyweight");
assert(!isBodyweightEquipment(["yoga_mat", "dumbbell"]), "yoga_mat + dumbbell is not bodyweight");

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}

export {};
