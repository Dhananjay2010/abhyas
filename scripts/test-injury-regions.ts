import { currentInjuryRegions, hasAnyKneeInjury, type InjuryRow } from "../src/lib/program/injury-regions";

console.log("Testing injury-regions helpers");
console.log("=====================================\n");

// Test cases
const testCases = [
  {
    name: "Current knee only",
    injuries: [{ region: "knee", severity: "current" }] as InjuryRow[],
    expectedCurrent: ["knee"],
    expectedAnyKnee: true,
  },
  {
    name: "Past knee only",
    injuries: [{ region: "knee", severity: "past" }] as InjuryRow[],
    expectedCurrent: [],
    expectedAnyKnee: true,
  },
  {
    name: "Current knee + past knee",
    injuries: [
      { region: "knee", severity: "current" },
      { region: "knee", severity: "past" },
    ] as InjuryRow[],
    expectedCurrent: ["knee"],
    expectedAnyKnee: true,
  },
  {
    name: "Current shoulder + past knee",
    injuries: [
      { region: "shoulder", severity: "current" },
      { region: "knee", severity: "past" },
    ] as InjuryRow[],
    expectedCurrent: ["shoulder"],
    expectedAnyKnee: true,
  },
  {
    name: "Past shoulder only (no knee)",
    injuries: [{ region: "shoulder", severity: "past" }] as InjuryRow[],
    expectedCurrent: [],
    expectedAnyKnee: false,
  },
  {
    name: "Multiple current injuries",
    injuries: [
      { region: "knee", severity: "current" },
      { region: "lower_back", severity: "current" },
    ] as InjuryRow[],
    expectedCurrent: ["knee", "lower_back"],
    expectedAnyKnee: true,
  },
  {
    name: "No injuries",
    injuries: [] as InjuryRow[],
    expectedCurrent: [],
    expectedAnyKnee: false,
  },
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  
  const current = currentInjuryRegions(testCase.injuries);
  const anyKnee = hasAnyKneeInjury(testCase.injuries);
  
  const currentMatch = JSON.stringify(current.sort()) === JSON.stringify(testCase.expectedCurrent.sort());
  const anyKneeMatch = anyKnee === testCase.expectedAnyKnee;
  
  if (currentMatch && anyKneeMatch) {
    console.log("  ✓ PASS");
    passed++;
  } else {
    console.log("  ✗ FAIL");
    if (!currentMatch) {
      console.log(`    currentInjuryRegions: expected ${JSON.stringify(testCase.expectedCurrent)}, got ${JSON.stringify(current)}`);
    }
    if (!anyKneeMatch) {
      console.log(`    hasAnyKneeInjury: expected ${testCase.expectedAnyKnee}, got ${anyKnee}`);
    }
    failed++;
  }
  console.log();
}

console.log("=====================================");
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
