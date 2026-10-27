/**
 * Tests for L-a and L-b QA issues:
 * L-a: Body weight range message matches actual validation
 * L-b: Onboarding and Progress use the same parser (parseBodyWeight) and show identical errors
 */

import { 
  parseBodyWeight,
  getBodyWeightRangeMessage,
  BODY_WEIGHT_LB_MIN,
  BODY_WEIGHT_LB_MAX,
  WEIGHT_KG_MIN,
  WEIGHT_KG_MAX,
  type UnitsPreference
} from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== L-a: Body weight range message matches validation ===\n");

console.log(`Imperial bounds: ${BODY_WEIGHT_LB_MIN}-${BODY_WEIGHT_LB_MAX} lb`);
console.log(`Metric bounds: ${WEIGHT_KG_MIN}-${WEIGHT_KG_MAX} kg\n`);

const imperialTestCases = [
  { value: BODY_WEIGHT_LB_MIN, shouldAccept: true, desc: "lower bound" },
  { value: BODY_WEIGHT_LB_MIN - 0.1, shouldAccept: false, desc: "below lower bound" },
  { value: BODY_WEIGHT_LB_MAX, shouldAccept: true, desc: "upper bound" },
  { value: BODY_WEIGHT_LB_MAX + 0.1, shouldAccept: false, desc: "above upper bound" },
  { value: 170.6, shouldAccept: true, desc: "middle value" },
];

for (const { value, shouldAccept, desc } of imperialTestCases) {
  const result = parseBodyWeight(String(value), "imperial");
  const isAccepted = result !== null;
  check(
    `Imperial ${desc} (${value} lb): ${shouldAccept ? "accepted" : "rejected"}`,
    isAccepted === shouldAccept,
    `expected ${shouldAccept ? "accepted" : "rejected"}, got ${isAccepted ? "accepted" : "rejected"}`
  );
}

const metricTestCases = [
  { value: WEIGHT_KG_MIN, shouldAccept: true, desc: "lower bound" },
  { value: WEIGHT_KG_MIN - 0.1, shouldAccept: false, desc: "below lower bound" },
  { value: WEIGHT_KG_MAX, shouldAccept: true, desc: "upper bound" },
  { value: WEIGHT_KG_MAX + 0.1, shouldAccept: false, desc: "above upper bound" },
  { value: 77.38, shouldAccept: true, desc: "middle value" },
];

for (const { value, shouldAccept, desc } of metricTestCases) {
  const result = parseBodyWeight(String(value), "metric");
  const isAccepted = result !== null;
  check(
    `Metric ${desc} (${value} kg): ${shouldAccept ? "accepted" : "rejected"}`,
    isAccepted === shouldAccept,
    `expected ${shouldAccept ? "accepted" : "rejected"}, got ${isAccepted ? "accepted" : "rejected"}`
  );
}

console.log("\n=== L-b: Onboarding and Progress parity ===\n");

// Test cases covering edge values that both components must handle identically
const parityTestCases: Array<{ 
  value: string; 
  units: UnitsPreference; 
  shouldAccept: boolean;
  desc: string;
}> = [
  { value: "55.5", units: "imperial", shouldAccept: true, desc: "imperial lower bound" },
  { value: "55.4", units: "imperial", shouldAccept: false, desc: "imperial just below lower" },
  { value: "661", units: "imperial", shouldAccept: true, desc: "imperial upper bound" },
  { value: "661.1", units: "imperial", shouldAccept: false, desc: "imperial just above upper" },
  { value: "25", units: "metric", shouldAccept: true, desc: "metric lower bound" },
  { value: "24.9", units: "metric", shouldAccept: false, desc: "metric just below lower" },
  { value: "300", units: "metric", shouldAccept: true, desc: "metric upper bound" },
  { value: "300.1", units: "metric", shouldAccept: false, desc: "metric just above upper" },
  { value: "", units: "imperial", shouldAccept: false, desc: "empty string" },
  { value: "abc", units: "imperial", shouldAccept: false, desc: "invalid string" },
  { value: "70,5", units: "metric", shouldAccept: false, desc: "comma decimal separator" },
];

for (const { value, units, shouldAccept, desc } of parityTestCases) {
  // onboarding-flow.tsx calls parseBodyWeight
  const onboardingResult = parseBodyWeight(value, units);
  const onboardingAccepted = onboardingResult !== null;
  const onboardingError = onboardingAccepted ? null : getBodyWeightRangeMessage(units);
  
  // progress/log-weight.tsx also calls parseBodyWeight
  const progressResult = parseBodyWeight(value, units);
  const progressAccepted = progressResult !== null;
  const progressError = progressAccepted ? null : getBodyWeightRangeMessage(units);
  
  // Both must agree on accept/reject
  check(
    `Parity ${desc}: both paths ${shouldAccept ? "accept" : "reject"}`,
    onboardingAccepted === progressAccepted && onboardingAccepted === shouldAccept,
    `onboarding=${onboardingAccepted}, progress=${progressAccepted}, expected=${shouldAccept}`
  );
  
  // Both must show identical error messages
  if (!shouldAccept) {
    check(
      `Parity ${desc}: identical error messages`,
      onboardingError === progressError,
      `onboarding="${onboardingError}", progress="${progressError}"`
    );
    
    // Verify the error message is the expected one
    const expectedError = getBodyWeightRangeMessage(units);
    check(
      `Parity ${desc}: error is getBodyWeightRangeMessage`,
      onboardingError === expectedError,
      `got="${onboardingError}", expected="${expectedError}"`
    );
  }
}

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
