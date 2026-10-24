import { selectionInjuryRegions, type InjuryRow } from "../src/lib/program/injury-regions";

console.log("Testing selectionInjuryRegions helper");
console.log("=====================================\n");

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}${details ? ` — ${details}` : ""}`);
    failed++;
  }
}

// Test 1: Empty array
const result1 = selectionInjuryRegions([]);
check("Empty array returns empty", result1.length === 0);

// Test 2: Current injuries only
const result2 = selectionInjuryRegions([
  { region: "knee", severity: "current" },
  { region: "shoulder", severity: "current" },
]);
check(
  "Current injuries included",
  result2.length === 2 && result2.includes("knee") && result2.includes("shoulder")
);

// Test 3: Past knee only
const result3 = selectionInjuryRegions([
  { region: "knee", severity: "past" },
]);
check(
  "Past knee injury included",
  result3.length === 1 && result3[0] === "knee"
);

// Test 4: Past non-knee injuries excluded
const result4 = selectionInjuryRegions([
  { region: "shoulder", severity: "past" },
  { region: "lower_back", severity: "past" },
]);
check(
  "Past non-knee injuries excluded",
  result4.length === 0
);

// Test 5: Mixed injuries
const result5 = selectionInjuryRegions([
  { region: "knee", severity: "past" },
  { region: "shoulder", severity: "past" },
  { region: "lower_back", severity: "current" },
]);
check(
  "Mixed: past knee + past shoulder + current lower_back",
  result5.length === 2 && result5.includes("knee") && result5.includes("lower_back"),
  result5.length === 2 ? "correct" : `got [${result5.join(", ")}]`
);

// Test 6: Multiple past knees (de-duplication)
const result6 = selectionInjuryRegions([
  { region: "knee", severity: "past" },
  { region: "knee", severity: "past" },
]);
check(
  "Multiple past knee entries",
  result6.length === 2 && result6.every(r => r === "knee"),
  "duplicates allowed (array not de-duped)"
);

// Test 7: Owner scenario (past knee only)
const result7 = selectionInjuryRegions([
  { region: "knee", severity: "past" },
]);
check(
  "Owner scenario: past knee surgery",
  result7.length === 1 && result7[0] === "knee"
);

// Test 8: Both current and past knee
const result8 = selectionInjuryRegions([
  { region: "knee", severity: "current" },
  { region: "knee", severity: "past" },
]);
check(
  "Both current and past knee",
  result8.length === 2 && result8.every(r => r === "knee"),
  "both included (can be de-duped by caller if needed)"
);

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
