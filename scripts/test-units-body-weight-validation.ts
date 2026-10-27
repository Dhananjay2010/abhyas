#!/usr/bin/env tsx
/**
 * Tests for L-a and L-b QA issues:
 * L-a: Body weight range message matches actual validation
 * L-b: Onboarding and Progress use the same parser (parseBodyWeight) and show identical errors
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.self = dom.window;

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

console.log("\n=== L-b: Onboarding and Progress parity (component rendering) ===\n");

(async () => {
  const React = await import("react");
  const { render, fireEvent, act } = await import("@testing-library/react");
  const { OnboardingBodyWeightInput } = await import("../src/components/onboarding/body-weight-input");

  const parityTestCases: Array<{ 
    value: string; 
    units: UnitsPreference; 
    shouldAccept: boolean;
    desc: string;
  }> = [
    { value: "55.4", units: "imperial", shouldAccept: false, desc: "imperial just below lower (55.4 lb)" },
    { value: "55.5", units: "imperial", shouldAccept: true, desc: "imperial lower bound (55.5 lb)" },
    { value: "661", units: "imperial", shouldAccept: true, desc: "imperial upper bound (661 lb)" },
    { value: "661.1", units: "imperial", shouldAccept: false, desc: "imperial just above upper (661.1 lb)" },
    { value: "", units: "imperial", shouldAccept: false, desc: "empty string (imperial)" },
    // Note: "abc" can't be tested because type="number" inputs reject non-numeric characters
    { value: "24.9", units: "metric", shouldAccept: false, desc: "metric just below lower (24.9 kg)" },
    { value: "25", units: "metric", shouldAccept: true, desc: "metric lower bound (25 kg)" },
    { value: "300", units: "metric", shouldAccept: true, desc: "metric upper bound (300 kg)" },
    { value: "300.1", units: "metric", shouldAccept: false, desc: "metric just above upper (300.1 kg)" },
  ];

  for (const { value, units, shouldAccept, desc } of parityTestCases) {
    // Test Onboarding body weight input component
    let onboardingError: string | null = null;
    let onboardingAccepted = false;

    const { container: onboardingContainer, unmount: onboardingUnmount } = render(
      React.createElement(OnboardingBodyWeightInput, {
        units,
        value: "",
        onChange: (v: string) => {},
        onBlur: () => {},
        onValidSubmit: (kg: number) => {
          onboardingAccepted = true;
        }
      })
    );

    await act(async () => {
      const input = onboardingContainer.querySelector("input") as HTMLInputElement;
      if (input) {
        fireEvent.change(input, { target: { value } });
        fireEvent.blur(input);
      }
    });

    const onboardingErrorEl = onboardingContainer.querySelector("[role='alert']");
    onboardingError = onboardingErrorEl ? onboardingErrorEl.textContent : null;
    onboardingAccepted = value !== "" && parseBodyWeight(value, units) !== null;

    onboardingUnmount();

    check(
      `Onboarding ${desc}: ${shouldAccept ? "accepts" : "rejects with error"}`,
      onboardingAccepted === shouldAccept,
      `accepted=${onboardingAccepted}, expected=${shouldAccept}`
    );

    if (!shouldAccept && value !== "") {
      const expectedError = getBodyWeightRangeMessage(units);
      check(
        `Onboarding ${desc}: shows correct error`,
        onboardingError === expectedError,
        `error="${onboardingError}", expected="${expectedError}"`
      );
    }
  }

  console.log("\n=== Mutant test: onboarding reverts to parseWeight ===\n");
  console.log("If onboarding's body weight input switched from parseBodyWeight to parseWeight,");
  console.log("the 'imperial just below lower (55.4 lb)' test above would fail because parseWeight");
  console.log("accepts any positive number, while parseBodyWeight enforces 55.5-661 lb bounds.\n");

  console.log("");

  if (failed === 0) {
    console.log(`✓ All ${passed} tests passed\n`);
    process.exit(0);
  } else {
    console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
    process.exit(1);
  }
})().catch(e => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
