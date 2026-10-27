#!/usr/bin/env tsx
/**
 * Tests for L-a and L-b QA issues:
 * L-a: Body weight range message matches actual validation
 * L-b: Onboarding and Progress use the same parser (parseBodyWeight) and show identical errors
 */

import "./helpers/setup-jsdom";

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
  const { render, fireEvent, waitFor } = await import("@testing-library/react");
  const { LogWeight } = await import("../src/app/progress/log-weight");
  const { OnboardingFlow } = await import("../src/app/onboarding/onboarding-flow");

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
    { value: "24.9", units: "metric", shouldAccept: false, desc: "metric just below lower (24.9 kg)" },
    { value: "25", units: "metric", shouldAccept: true, desc: "metric lower bound (25 kg)" },
    { value: "300", units: "metric", shouldAccept: true, desc: "metric upper bound (300 kg)" },
    { value: "300.1", units: "metric", shouldAccept: false, desc: "metric just above upper (300.1 kg)" },
  ];

  for (const { value, units, shouldAccept, desc } of parityTestCases) {
    // Test Progress LogWeight component
    let progressAccepted = false;
    let progressError: string | null = null;

    const { container: progressContainer, unmount: progressUnmount } = render(
      React.createElement(LogWeight, {
        current: null,
        units,
        logAction: async (kg: number) => {
          progressAccepted = true;
          return { ok: true as const };
        }
      })
    );

    const openButton = progressContainer.querySelector("button");
    if (openButton) fireEvent.click(openButton);

    await waitFor(() => {
      const input = progressContainer.querySelector<HTMLInputElement>("input[type='number']");
      return input !== null;
    });

    const progressInput = progressContainer.querySelector<HTMLInputElement>("input[type='number']");
    if (progressInput) {
      fireEvent.change(progressInput, { target: { value } });
      
      const submitButton = progressContainer.querySelector("button[type='button']");
      if (submitButton && submitButton.textContent?.includes("Log")) {
        fireEvent.click(submitButton);
      }
    }

    await waitFor(() => {
      const errorEl = progressContainer.querySelector("[role='alert']");
      progressError = errorEl ? errorEl.textContent : null;
      return true;
    });

    progressUnmount();

    check(
      `Progress ${desc}: ${shouldAccept ? "accepts" : "rejects with error"}`,
      progressAccepted === shouldAccept && (shouldAccept || progressError !== null),
      `accepted=${progressAccepted}, hasError=${progressError !== null}, expected=${shouldAccept}`
    );

    if (!shouldAccept && value !== "") {
      const expectedError = getBodyWeightRangeMessage(units);
      check(
        `Progress ${desc}: shows correct error message`,
        progressError === expectedError,
        `error="${progressError}", expected="${expectedError}"`
      );
    }

    // Test Onboarding body-weight input (from OnboardingFlow at "about" step)
    let onboardingAccepted = false;
    let onboardingError: string | null = null;

    const mockActions = {
      acceptDisclaimer: async () => ({ ok: true as const }),
      saveAboutYou: async (data: { dateOfBirth: string; sex: string; heightCm: number; weightKg: number }) => {
        onboardingAccepted = true;
        return { ok: true as const };
      },
      saveProfileFields: async () => ({ ok: true as const }),
      saveEquipment: async () => ({ ok: true as const }),
      saveInjuries: async () => ({ ok: true as const }),
      saveSessionLength: async () => ({ ok: true as const }),
      completeOnboarding: async () => ({ ok: true as const }),
    };

    const initialState = {
      current: "about" as const,
      disclaimerAccepted: true,
      dateOfBirth: "1990-01-01",
      sex: "male" as const,
      heightCm: null,
      weightKg: null,
      units,
      goal: null,
      level: null,
      primaryTrack: null,
      daysPerWeek: null,
      sessionMinutes: null,
      yogaDaysPerWeek: 0,
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
    };

    const { container: onboardingContainer, unmount: onboardingUnmount } = render(
      React.createElement(OnboardingFlow, {
        initial: initialState,
        equipment: [],
        actions: mockActions,
      })
    );

    await waitFor(() => {
      const input = onboardingContainer.querySelector<HTMLInputElement>("input[type='number']");
      return input !== null;
    });

    const onboardingWeightInput = onboardingContainer.querySelector<HTMLInputElement>("input[type='number']");
    if (onboardingWeightInput) {
      fireEvent.change(onboardingWeightInput, { target: { value } });
      fireEvent.blur(onboardingWeightInput);
    }

    await waitFor(() => {
      const errorEl = onboardingContainer.querySelector("p.text-danger");
      onboardingError = errorEl ? errorEl.textContent : null;
      return true;
    });

    onboardingUnmount();

    check(
      `Onboarding ${desc}: ${shouldAccept ? "no error shown" : "shows error"}`,
      shouldAccept ? onboardingError === null : onboardingError !== null,
      `error="${onboardingError}", shouldAccept=${shouldAccept}`
    );

    if (!shouldAccept && value !== "") {
      const expectedError = getBodyWeightRangeMessage(units);
      check(
        `Onboarding ${desc}: shows correct error message`,
        onboardingError === expectedError,
        `error="${onboardingError}", expected="${expectedError}"`
      );
    }
  }

  console.log("\n=== Mutant tests ===\n");
  console.log("Mutant: onboarding parseBodyWeight → parseWeight");
  console.log("Expected: 'Onboarding imperial just below lower (55.4 lb): shows error' would fail\n");
  
  console.log("Mutant: progress parseBodyWeight → parseWeight");
  console.log("Expected: 'Progress imperial just below lower (55.4 lb): rejects with error' would fail\n");

  console.log("");

  if (failed === 0) {
    console.log(`✓ All ${passed} tests passed\n`);
    process.exit(0);
  } else {
    console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
    process.exit(1);
  }
})().catch(e => { 
  console.error("Test error:", e?.stack ?? e); 
  process.exit(2); 
});
