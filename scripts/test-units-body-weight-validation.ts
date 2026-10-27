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
  const { render, fireEvent, waitFor, act } = await import("@testing-library/react");
  const { LogWeight } = await import("../src/app/progress/log-weight");
  const { OnboardingFlow } = await import("../src/app/onboarding/onboarding-flow");

  const parityTestCases: Array<{ 
    value: string; 
    units: UnitsPreference; 
    shouldAccept: boolean;
    desc: string;
    expectedKg?: number;
  }> = [
    { value: "55.4", units: "imperial", shouldAccept: false, desc: "imperial just below lower (55.4 lb)" },
    { value: "55.5", units: "imperial", shouldAccept: true, desc: "imperial lower bound (55.5 lb)", expectedKg: 25.2 },
    { value: "661", units: "imperial", shouldAccept: true, desc: "imperial upper bound (661 lb)", expectedKg: 299.8 },
    { value: "661.1", units: "imperial", shouldAccept: false, desc: "imperial just above upper (661.1 lb)" },
    { value: "", units: "imperial", shouldAccept: false, desc: "empty string (imperial)" },
    { value: "24.9", units: "metric", shouldAccept: false, desc: "metric just below lower (24.9 kg)" },
    { value: "25", units: "metric", shouldAccept: true, desc: "metric lower bound (25 kg)", expectedKg: 25 },
    { value: "300", units: "metric", shouldAccept: true, desc: "metric upper bound (300 kg)", expectedKg: 300 },
    { value: "300.1", units: "metric", shouldAccept: false, desc: "metric just above upper (300.1 kg)" },
  ];

  for (const { value, units, shouldAccept, desc, expectedKg } of parityTestCases) {
    // Test Progress LogWeight component
    let progressAccepted = false;
    let progressCapturedKg: number | null = null;
    let progressError: string | null = null;

    const { container: progressContainer, unmount: progressUnmount } = render(
      React.createElement(LogWeight, {
        current: null,
        units,
        logAction: async (weightKg) => {
          progressAccepted = true;
          progressCapturedKg = weightKg;
          return { ok: true as const };
        }
      })
    );

    // Must find open button or fail
    await waitFor(() => {
      const openButton = progressContainer.querySelector("button");
      if (!openButton) throw new Error("Progress open button not found");
    });
    
    const openButton = progressContainer.querySelector("button");
    if (!openButton) throw new Error("Progress open button not found");
    fireEvent.click(openButton);

    await waitFor(() => {
      const input = progressContainer.querySelector<HTMLInputElement>("input[type='number']");
      if (!input) throw new Error("Progress input not found");
    });

    const progressInput = progressContainer.querySelector<HTMLInputElement>("input[type='number']");
    if (!progressInput) throw new Error("Progress input not found after waitFor");
    
    act(() => {
      fireEvent.change(progressInput, { target: { value } });
    });
    
    // Must find submit button or fail
    await waitFor(() => {
      const submitButton = Array.from(progressContainer.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Save") || btn.textContent?.includes("Log")
      );
      if (!submitButton) throw new Error("Progress submit button not found");
    });

    const submitButton = Array.from(progressContainer.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Save") || btn.textContent?.includes("Log")
    );
    if (!submitButton) throw new Error("Progress submit button not found after waitFor");

    await act(async () => {
      fireEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    const errorEl = progressContainer.querySelector("[role='alert']");
    progressError = errorEl ? errorEl.textContent : null;

    progressUnmount();

    if (shouldAccept) {
      check(
        `Progress ${desc}: accepts`,
        progressAccepted && progressError === null,
        `accepted=${progressAccepted}, error="${progressError}"`
      );
      
      if (expectedKg !== undefined) {
        const tolerance = 0.1;
        const kgMatch = progressCapturedKg !== null && Math.abs(progressCapturedKg - expectedKg) < tolerance;
        check(
          `Progress ${desc}: logAction receives ~${expectedKg} kg`,
          kgMatch,
          `got ${progressCapturedKg}, expected ${expectedKg}`
        );
      }
    } else {
      check(
        `Progress ${desc}: ${value === "" ? "rejects empty" : "rejects with error"}`,
        !progressAccepted && (value === "" || progressError !== null),
        `accepted=${progressAccepted}, error="${progressError}"`
      );

      if (value !== "") {
        const expectedError = getBodyWeightRangeMessage(units);
        check(
          `Progress ${desc}: shows correct error message`,
          progressError === expectedError,
          `error="${progressError}", expected="${expectedError}"`
        );
      }
    }

    // Test Onboarding body-weight input (from OnboardingFlow at "about" step)
    let onboardingError: string | null = null;
    let onboardingCapturedKg: number | null = null;

    const mockActions = {
      acceptDisclaimer: async () => ({ ok: true as const }),
      saveAboutYou: async (data: { weightKg: number; heightCm: number; sex: string }) => {
        onboardingCapturedKg = data.weightKg;
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
      displayName: null,
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
      if (!input) throw new Error("Onboarding input not found");
    });

    const onboardingWeightInput = onboardingContainer.querySelector<HTMLInputElement>("input[type='number']");
    if (!onboardingWeightInput) throw new Error("Onboarding input not found after waitFor");
    
    fireEvent.change(onboardingWeightInput, { target: { value } });
    fireEvent.blur(onboardingWeightInput);

    await waitFor(() => {
      const errorEl = onboardingContainer.querySelector("p.text-danger");
      onboardingError = errorEl ? errorEl.textContent : null;
      return true;
    });

    onboardingUnmount();

    check(
      `Onboarding ${desc}: ${shouldAccept ? "no error shown" : "shows error"}`,
      value === "" ? onboardingError === null : (shouldAccept ? onboardingError === null : onboardingError !== null),
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

    if (shouldAccept && expectedKg !== undefined) {
      const tolerance = 0.1;
      const kgMatch = onboardingCapturedKg !== null && Math.abs(onboardingCapturedKg - expectedKg) < tolerance;
      check(
        `Onboarding ${desc}: saveAboutYou receives ~${expectedKg} kg`,
        kgMatch,
        `got ${onboardingCapturedKg}, expected ${expectedKg}`
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
})().catch(e => { 
  console.error("Test error:", e?.stack ?? e); 
  process.exit(2); 
});
