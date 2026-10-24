/**
 * Real render tests of Settings units toggle, LogWeight, and OnboardingFlow.
 * 
 * Tests:
 * 1. SettingsForm: Click Imperial button, assert spy saves units='imperial' and control has aria-pressed
 * 2. LogWeight: With imperial, label shows lb, stored 80 kg displays as 176 lb
 * 3. LogWeight: Type 176 lb, click Save, assert ~79.8 kg sent; type 50 lb, assert error shown and no save
 * 4. OnboardingFlow about step: With imperial, hints show lb/ft-in, typing saves correct kg/cm
 * 5. Validation: parseWeight/parseHeight return null outside valid ranges
 * 
 * npm run test:units-settings-toggle
 */

// Must be first import before any React code
import "./helpers/setup-jsdom";

// Mock next/navigation before any components import it
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push: () => {},
        replace: () => {},
        prefetch: () => {},
        back: () => {},
        forward: () => {},
        refresh: () => {},
      }),
      usePathname: () => "/test",
      useSearchParams: () => new URLSearchParams(),
    };
  }
  return originalRequire.apply(this, arguments);
};

import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsState, type SettingsActions } from "../src/app/settings/settings-form";
import { LogWeight } from "../src/app/progress/log-weight";
import { OnboardingFlow, type InitialState, type OnboardingActions } from "../src/app/onboarding/onboarding-flow";
import { parseWeight, parseHeight } from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function approxEqual(a: number, b: number, epsilon = 0.5): boolean {
  return Math.abs(a - b) < epsilon;
}

(async () => {
  console.log("\n1. SettingsForm Imperial button saves units='imperial' with aria-pressed");

  {
    let savedUnits: string | null = null;

    const mockActions: SettingsActions = {
      updateSessionSettings: async () => ({ ok: true }),
      updateProfileSettings: async (patch) => {
        if (patch.units) {
          savedUnits = patch.units;
        }
        return { ok: true };
      },
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    const initial: SettingsState = {
      goal: "strength",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      preferredSessionMinutes: 45,
      hasAllEquipment: true,
      equipmentIds: [],
      injuries: [],
      planningMode: "progression",
      perSetLogging: true,
      resumeSession: true,
      cooldownEnabled: true,
      restAutostart: true,
      restSound: true,
      restVibrate: true,
      restOverrideSeconds: null,
      bodyweightPrompt: "weekly",
      timezone: null,
      units: "metric",
    };

    const { container } = render(
      React.createElement(SettingsForm, {
        initial,
        equipment: [],
        timezones: ["UTC"],
        actions: mockActions,
      })
    );

    const imperialButtons = Array.from(container.querySelectorAll("button")).filter((btn) =>
      btn.textContent?.includes("Imperial")
    );
    
    check("Found Imperial button", imperialButtons.length > 0, `found ${imperialButtons.length}`);

    if (imperialButtons.length > 0) {
      const imperialButton = imperialButtons[0];
      const initialPressed = imperialButton.getAttribute("aria-pressed");
      check("Initial aria-pressed is 'false'", initialPressed === "false", `got '${initialPressed}'`);

      await userEvent.click(imperialButton);
      await new Promise((resolve) => setTimeout(resolve, 100));

      check(
        "updateProfileSettings called with units='imperial'",
        savedUnits === "imperial",
        `got '${savedUnits}'`
      );
    }
  }

  console.log("\n2. LogWeight with imperial: stored 80 kg displays as ~176 lb");

  {
    const { container } = render(
      React.createElement(LogWeight, {
        current: 80,
        units: "imperial",
      })
    );

    const openButton = container.querySelector("button");
    check("Log weight button exists", openButton !== null);

    if (openButton) {
      await userEvent.click(openButton);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input = container.querySelector('input[type="number"]');
      check("Input field rendered", input !== null);

      if (input) {
        const inputValue = (input as HTMLInputElement).value;
        const displayedLb = parseFloat(inputValue);
        check(
          "Stored 80 kg displays as ~176 lb",
          displayedLb > 0 && approxEqual(displayedLb, 176, 1),
          `got ${displayedLb}`
        );

        const placeholder = (input as HTMLInputElement).placeholder;
        check("Placeholder shows lb", placeholder === "lb", `got '${placeholder}'`);
      }
    }
  }

  console.log("\n3. LogWeight: Type 176 lb, click Save, assert ~79.8 kg sent; type 50 lb shows error, no save");

  {
    const spy = {
      savedKg: null as number | null,
      callCount: 0,
    };

    const mockLogAction = async (kg: number) => {
      spy.savedKg = kg;
      spy.callCount++;
      return { ok: true } as const;
    };

    // Test 1: Type 176 lb and assert correct kg saved
    const { container: container1 } = render(
      React.createElement(LogWeight, {
        current: null,
        units: "imperial",
        logAction: mockLogAction,
      })
    );

    const openButton1 = container1.querySelector("button");
    if (openButton1) {
      await userEvent.click(openButton1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input1 = container1.querySelector('input[type="number"]');
      if (input1) {
        await userEvent.clear(input1);
        await userEvent.type(input1, "176");

        const saveButton = Array.from(container1.querySelectorAll("button")).find(
          (btn) => btn.textContent === "Save"
        );

        if (saveButton) {
          await userEvent.click(saveButton);
          await new Promise((resolve) => setTimeout(resolve, 100));

          check(
            "Typing 176 lb, clicking Save sends ~79.8 kg (79.7-79.9)",
            spy.savedKg !== null && spy.savedKg >= 79.7 && spy.savedKg <= 79.9,
            spy.savedKg !== null ? `got ${spy.savedKg.toFixed(2)}` : `got ${spy.savedKg}`
          );
        }
      }
    }

    // Test 2: Type 50 lb (out of range), assert error shown and no save
    const initialCallCount = spy.callCount;

    const { container: container2 } = render(
      React.createElement(LogWeight, {
        current: null,
        units: "imperial",
        logAction: mockLogAction,
      })
    );

    const openButton2 = container2.querySelector("button");
    if (openButton2) {
      await userEvent.click(openButton2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input2 = container2.querySelector('input[type="number"]');
      if (input2) {
        await userEvent.clear(input2);
        await userEvent.type(input2, "50");

        const saveButton = Array.from(container2.querySelectorAll("button")).find(
          (btn) => btn.textContent === "Save"
        );

        if (saveButton) {
          await userEvent.click(saveButton);
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Check error is displayed
          const errorText = container2.textContent;
          const hasError = errorText?.includes("between 55 and 661 lb");
          check("Typing 50 lb shows 'between 55 and 661 lb' error", hasError);

          check(
            "logAction NOT called for out-of-range value",
            spy.callCount === initialCallCount,
            `calls: ${spy.callCount}`
          );
        }
      }
    }
  }

  console.log("\n4. OnboardingFlow about step with imperial: hints show lb/ft-in, submission converts");

  {
    const aboutSpy = {
      savedHeight: null as number | null,
      savedWeight: null as number | null,
      callCount: 0,
    };

    const mockOnboardingActions: OnboardingActions = {
      acceptDisclaimer: async () => ({ ok: true }),
      saveAboutYou: async (input) => {
        aboutSpy.savedHeight = input.heightCm;
        aboutSpy.savedWeight = input.weightKg;
        aboutSpy.callCount++;
        return { ok: true };
      },
      saveProfileFields: async () => ({ ok: true }),
      saveEquipment: async () => ({ ok: true }),
      saveInjuries: async () => ({ ok: true }),
      saveSessionLength: async () => ({ ok: true }),
      completeOnboarding: async () => ({ ok: true }),
    };

    // Start on the about step by setting disclaimerAccepted=true
    const initialState: InitialState = {
      displayName: "Test User",
      dateOfBirth: null,
      sex: null,
      heightCm: null,
      weightKg: null,
      goal: null,
      level: null,
      primaryTrack: null,
      daysPerWeek: null,
      sessionMinutes: null,
      yogaDaysPerWeek: 0,
      disclaimerAccepted: true,
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
      units: "imperial",
    };

    const mockRouter = {
      push: () => {},
      replace: () => {},
      prefetch: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
    };

    const { container } = render(
      React.createElement(OnboardingFlow, {
        initial: initialState,
        equipment: [],
        actions: mockOnboardingActions,
        router: mockRouter as any,
      })
    );

    // Check hints show imperial units
    const containerText = container.textContent || "";
    check("Height hint shows ft'in\"", containerText.includes(`ft'in"`), `text contains ft'in"`);
    check("Weight hint shows lb", containerText.includes("lb"), `text contains lb`);

    // Fill in the form
    const inputs = container.querySelectorAll("input");
    
    // DOB inputs (type="text")
    const dobInputs = Array.from(inputs).filter((inp) => (inp as HTMLInputElement).type === "text");
    
    // Height and weight inputs (type="number" or "text" with specific placeholders)
    const allInputs = Array.from(inputs);
    const heightInput = allInputs.find((inp) => {
      const placeholder = (inp as HTMLInputElement).placeholder;
      return placeholder?.includes("5'9") || placeholder?.includes("ft");
    });
    const weightInput = allInputs.find((inp) => {
      const placeholder = (inp as HTMLInputElement).placeholder;
      return placeholder?.includes("154") || placeholder?.includes("lb");
    });

    const sexButtons = Array.from(container.querySelectorAll("button")).filter((btn) =>
      btn.textContent === "Male" || btn.textContent === "Female"
    );

    // Fill DOB (DD, MM, YYYY)
    if (dobInputs.length >= 3) {
      await userEvent.type(dobInputs[0], "15");
      await userEvent.type(dobInputs[1], "06");
      await userEvent.type(dobInputs[2], "1990");
    }

    // Select sex
    if (sexButtons.length > 0) {
      await userEvent.click(sexButtons[0]);
    }

    // Fill height 5'9"
    if (heightInput) {
      await userEvent.clear(heightInput);
      await userEvent.type(heightInput, "5'9\"");
    }

    // Fill weight 176 lb
    if (weightInput) {
      await userEvent.clear(weightInput);
      await userEvent.type(weightInput, "176");
    }

    // Submit
    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Continue"
    );

    if (continueButton) {
      await userEvent.click(continueButton);
      await new Promise((resolve) => setTimeout(resolve, 200));

      check(
        "saveAboutYou called with heightCm ~175 (174-176)",
        aboutSpy.savedHeight !== null && aboutSpy.savedHeight >= 174 && aboutSpy.savedHeight <= 176,
        `got ${aboutSpy.savedHeight}`
      );

      check(
        "saveAboutYou called with weightKg ~79.8 (79.7-79.9)",
        aboutSpy.savedWeight !== null && aboutSpy.savedWeight >= 79.7 && aboutSpy.savedWeight <= 79.9,
        aboutSpy.savedWeight !== null ? `got ${aboutSpy.savedWeight.toFixed(2)}` : `got ${aboutSpy.savedWeight}`
      );
    }
  }

  console.log("\n5. OnboardingFlow: Out-of-range height/weight show imperial error, no save");

  {
    const errorSpy = { callCount: 0 };

    const mockOnboardingActions: OnboardingActions = {
      acceptDisclaimer: async () => ({ ok: true }),
      saveAboutYou: async () => {
        errorSpy.callCount++;
        return { ok: true };
      },
      saveProfileFields: async () => ({ ok: true }),
      saveEquipment: async () => ({ ok: true }),
      saveInjuries: async () => ({ ok: true }),
      saveSessionLength: async () => ({ ok: true }),
      completeOnboarding: async () => ({ ok: true }),
    };

    const initialState: InitialState = {
      displayName: "Test User",
      dateOfBirth: null,
      sex: null,
      heightCm: null,
      weightKg: null,
      goal: null,
      level: null,
      primaryTrack: null,
      daysPerWeek: null,
      sessionMinutes: null,
      yogaDaysPerWeek: 0,
      disclaimerAccepted: true,
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
      units: "imperial",
    };

    const mockRouter = {
      push: () => {},
      replace: () => {},
      prefetch: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
    };

    // Test out-of-range height: 3'0" (too low)
    {
      const { container: container1 } = render(
        React.createElement(OnboardingFlow, {
          initial: initialState,
          equipment: [],
          actions: mockOnboardingActions,
          router: mockRouter as any,
        })
      );

      const allInputs = Array.from(container1.querySelectorAll("input"));
      const heightInput = allInputs.find((inp) => {
        const placeholder = (inp as HTMLInputElement).placeholder;
        return placeholder?.includes("5'9") || placeholder?.includes("ft");
      });

      if (heightInput) {
        await userEvent.clear(heightInput);
        await userEvent.type(heightInput, "3'0\"");
        await userEvent.tab(); // trigger onBlur

        await new Promise((resolve) => setTimeout(resolve, 100));

        const errorText = container1.textContent;
        const hasHeightError = errorText?.includes(`between 3'3" and 8'2"`);
        check("Out-of-range height (3'0\") shows imperial error", hasHeightError);
      }
    }

    // Test out-of-range weight: 50 lb (too low)
    {
      const { container: container2 } = render(
        React.createElement(OnboardingFlow, {
          initial: initialState,
          equipment: [],
          actions: mockOnboardingActions,
          router: mockRouter as any,
        })
      );

      const allInputs = Array.from(container2.querySelectorAll("input"));
      const weightInput = allInputs.find((inp) => {
        const placeholder = (inp as HTMLInputElement).placeholder;
        return placeholder?.includes("154") || placeholder?.includes("lb");
      });

      if (weightInput) {
        await userEvent.clear(weightInput);
        await userEvent.type(weightInput, "50");
        await userEvent.tab(); // trigger onBlur

        await new Promise((resolve) => setTimeout(resolve, 100));

        const errorText = container2.textContent;
        const hasWeightError = errorText?.includes("between 55 and 661 lb");
        check("Out-of-range weight (50 lb) shows imperial error", hasWeightError);
      }
    }

    check("saveAboutYou NOT called for out-of-range values", errorSpy.callCount === 0);
  }

  console.log("\n6. Validation: parseWeight/parseHeight return null outside valid ranges");

  {
    // Weight validation (25-300 kg)
    check("parseWeight: 24 kg returns null (too low)", parseWeight("24", "metric") === null);
    check("parseWeight: 301 kg returns null (too high)", parseWeight("301", "metric") === null);
    check("parseWeight: 25 kg returns value (edge)", parseWeight("25", "metric") !== null);
    check("parseWeight: 300 kg returns value (edge)", parseWeight("300", "metric") !== null);
    
    // Imperial weight (55-661 lb ~ 25-300 kg)
    check("parseWeight: 50 lb returns null (too low)", parseWeight("50", "imperial") === null);
    check("parseWeight: 700 lb returns null (too high)", parseWeight("700", "imperial") === null);

    // Height validation (100-250 cm)
    check("parseHeight: 99 cm returns null (too low)", parseHeight("99", "metric") === null);
    check("parseHeight: 251 cm returns null (too high)", parseHeight("251", "metric") === null);
    check("parseHeight: 100 cm returns value (edge)", parseHeight("100", "metric") !== null);
    check("parseHeight: 250 cm returns value (edge)", parseHeight("250", "metric") !== null);

    // Imperial height (3'3"-8'2" ~ 100-250 cm)
    check("parseHeight: 3'0\" returns null (too low)", parseHeight("3'0\"", "imperial") === null);
    check("parseHeight: 8'5\" returns null (too high)", parseHeight("8'5\"", "imperial") === null);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
