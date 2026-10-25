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

// Mock next/navigation BEFORE importing OnboardingFlow
import Module from "node:module";
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string, ...args: unknown[]) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push: () => {},
        replace: () => {},
        back: () => {},
        forward: () => {},
        refresh: () => {},
        prefetch: () => {},
      }),
      usePathname: () => "/",
      useSearchParams: () => new URLSearchParams(),
    };
  }
  return originalRequire.apply(this, [id, ...args] as Parameters<typeof originalRequire>);
};

import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsState, type SettingsActions } from "../src/app/settings/settings-form";
import { LogWeight } from "../src/app/progress/log-weight";
import { parseWeight, parseHeight, formatWeight, formatHeight } from "../src/lib/units";

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
      setEquipmentItem: async () => ({ ok: true }),
      setHasAllEquipment: async () => ({ ok: true }),
      setInjury: async () => ({ ok: true }),
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
      dateOfBirth: null,
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
      check("Input is HTMLInputElement", input instanceof HTMLInputElement);

      if (input instanceof HTMLInputElement) {
        const inputValue = input.value;
        const displayedLb = parseFloat(inputValue);
        check(
          "Stored 80 kg displays as ~176 lb",
          displayedLb > 0 && approxEqual(displayedLb, 176, 1),
          `got ${displayedLb}`
        );

        const placeholder = input.placeholder;
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
    check("Open button exists (test 3.1)", !!openButton1);
    if (!openButton1) {
      failures++;
      console.log("  ABORT: Cannot continue without open button");
    } else {
      await userEvent.click(openButton1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input1 = container1.querySelector('input[type="number"]');
      check("Input field rendered (test 3.1)", !!input1);
      if (!input1) {
        failures++;
        console.log("  ABORT: Cannot continue without input field");
      } else {
        await userEvent.clear(input1);
        await userEvent.type(input1, "176");

        const saveButton = Array.from(container1.querySelectorAll("button")).find(
          (btn) => btn.textContent === "Save"
        );
        check("Save button exists (test 3.1)", !!saveButton);
        if (!saveButton) {
          failures++;
          console.log("  ABORT: Cannot continue without save button");
        } else {
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
    check("Open button exists (test 3.2)", !!openButton2);
    if (!openButton2) {
      failures++;
      console.log("  ABORT: Cannot continue without open button");
    } else {
      await userEvent.click(openButton2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input2 = container2.querySelector('input[type="number"]');
      check("Input field rendered (test 3.2)", !!input2);
      if (!input2) {
        failures++;
        console.log("  ABORT: Cannot continue without input field");
      } else {
        await userEvent.clear(input2);
        await userEvent.type(input2, "50");

        const saveButton = Array.from(container2.querySelectorAll("button")).find(
          (btn) => btn.textContent === "Save"
        );
        check("Save button exists (test 3.2)", !!saveButton);
        if (!saveButton) {
          failures++;
          console.log("  ABORT: Cannot continue without save button");
        } else {
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

  console.log("\n4. OnboardingFlow: Render with imperial, fill About form, assert kg/cm saved");

  {
    // Dynamically import OnboardingFlow after next/navigation is mocked
    const { OnboardingFlow } = await import("../src/app/onboarding/onboarding-flow");

    interface SaveAboutYouArgs {
      dateOfBirth: string | null;
      sex: string | null;
      heightCm: number | null;
      weightKg: number | null;
    }

    const spy = {
      savedAboutYou: null as SaveAboutYouArgs | null,
      callCount: 0,
    };

    const mockActions = {
      acceptDisclaimer: async () => ({ ok: true }) as const,
      saveAboutYou: async (args: SaveAboutYouArgs) => {
        spy.savedAboutYou = args;
        spy.callCount++;
        return { ok: true } as const;
      },
      saveProfileFields: async () => ({ ok: true }) as const,
      saveSessionLength: async () => ({ ok: true }) as const,
      saveEquipment: async () => ({ ok: true }) as const,
      saveInjuries: async () => ({ ok: true }) as const,
      completeOnboarding: async () => ({ ok: true }) as const,
    };

    type Sex = "male" | "female" | "other" | "prefer_not_to_say";
    type BodyRegion = "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle" | "core";
    type InjurySeverity = "current" | "past";
    type Goal = "strength" | "fat_loss" | "muscle_gain" | "general_fitness" | "flexibility_stress";
    type Level = "beginner" | "intermediate" | "expert";
    type Track = "weights" | "bodyweight" | "yoga" | "meditation";

    const initial = {
      displayName: null,
      goal: null as Goal | null,
      level: null as Level | null,
      primaryTrack: null as Track | null,
      daysPerWeek: null as number | null,
      sessionMinutes: 60,
      yogaDaysPerWeek: 0,
      dateOfBirth: null as string | null,
      sex: null as Sex | null,
      heightCm: null as number | null,
      weightKg: null as number | null,
      hasAllEquipment: false,
      equipmentIds: [] as string[],
      injuries: [] as Array<{ bodyRegion: BodyRegion; severity: InjurySeverity }>,
      units: "imperial" as "metric" | "imperial",
      disclaimerAccepted: true,
    };

    const equipment: Array<{ id: string; name: string; category: string }> = [];

    const { container, unmount } = render(
      React.createElement(OnboardingFlow, {
        initial,
        equipment,
        actions: mockActions,
      })
    );

    // The component starts at About step (disclaimer already accepted)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that hints show imperial units (main's code shows "kg" and "cm", not "lb" or "ft")
    const bodyText = container.textContent || "";
    check(
      "About step hints show imperial format (lb, not kg)",
      bodyText.includes("lb") && !bodyText.includes("kg"),
      `bodyText includes lb: ${bodyText.includes("lb")}, includes kg: ${bodyText.includes("kg")}`
    );

    // Find and fill DOB (use 1990-05-12)
    const dayInput = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Day"
    );
    const monthInput = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Month"
    );
    const yearInput = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Year"
    );

    check("DOB inputs exist", !!(dayInput && monthInput && yearInput));
    if (!dayInput || !monthInput || !yearInput) {
      failures++;
      console.log("  ABORT: Missing DOB inputs");
      unmount();
    } else {
      await userEvent.type(dayInput, "12");
      await userEvent.type(monthInput, "05");
      await userEvent.type(yearInput, "1990");

      // Find and click Male sex option (it's an OptionCard button, not a radio)
      const maleButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent === "Male"
      );
      check("Male button exists", !!maleButton);
      if (!maleButton) {
        failures++;
        console.log("  ABORT: Missing Male button");
        unmount();
      } else {
        await userEvent.click(maleButton);

        // Find height and weight inputs by placeholder
        const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'));
        const heightInput = allInputs.find(
          (el) => el.placeholder.includes("5'9")
        );
        const weightInput = allInputs.find(
          (el) => el.placeholder.includes("154")
        );

        check("Height input exists", !!heightInput);
        check("Weight input exists", !!weightInput);
        if (!heightInput || !weightInput) {
          failures++;
          console.log("  ABORT: Missing height/weight inputs");
          unmount();
        } else {
          await userEvent.clear(heightInput);
          await userEvent.type(heightInput, "5'9\"");
          await userEvent.clear(weightInput);
          await userEvent.type(weightInput, "176");

          // Find Continue button and click
          const continueButton = Array.from(container.querySelectorAll("button")).find(
            (btn) => btn.textContent?.includes("Continue")
          );
          check("Continue button exists", !!continueButton);
          if (!continueButton) {
            failures++;
            console.log("  ABORT: Missing Continue button");
            unmount();
          } else {
            await userEvent.click(continueButton);
            await new Promise((resolve) => setTimeout(resolve, 200));

            check(
              "saveAboutYou called once",
              spy.callCount === 1,
              `called ${spy.callCount} times`
            );

            if (spy.savedAboutYou) {
              check(
                "saveAboutYou received dateOfBirth 1990-05-12",
                spy.savedAboutYou.dateOfBirth === "1990-05-12",
                `got '${spy.savedAboutYou.dateOfBirth}'`
              );

              check(
                "saveAboutYou received sex 'male'",
                spy.savedAboutYou.sex === "male",
                `got '${spy.savedAboutYou.sex}'`
              );

              check(
                "saveAboutYou received heightCm ~175 (174-176)",
                spy.savedAboutYou.heightCm !== null &&
                  spy.savedAboutYou.heightCm >= 174 &&
                  spy.savedAboutYou.heightCm <= 176,
                `got ${spy.savedAboutYou.heightCm}`
              );

              check(
                "saveAboutYou received weightKg ~79.8 (79.5-80.1)",
                spy.savedAboutYou.weightKg !== null &&
                  spy.savedAboutYou.weightKg >= 79.5 &&
                  spy.savedAboutYou.weightKg <= 80.1,
                spy.savedAboutYou.weightKg !== null
                  ? `got ${spy.savedAboutYou.weightKg.toFixed(2)}`
                  : `got ${spy.savedAboutYou.weightKg}`
              );
            }

            unmount();
          }
        }
      }
    }

    // Test 2: Out-of-range height/weight show errors, no save
    console.log("\n4b. OnboardingFlow: Out-of-range height/weight show errors, no save");

    const spy2 = { callCount: 0 };
    const mockActions2 = {
      ...mockActions,
      saveAboutYou: async () => {
        spy2.callCount++;
        return { ok: true } as const;
      },
    };

    const { container: container2, unmount: unmount2 } = render(
      React.createElement(OnboardingFlow, {
        initial,
        equipment: equipment as Array<{ id: string; name: string; category: string }>,
        actions: mockActions2,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Fill with out-of-range values
    const dayInput2 = Array.from(container2.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Day"
    );
    const monthInput2 = Array.from(container2.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Month"
    );
    const yearInput2 = Array.from(container2.querySelectorAll<HTMLInputElement>('input')).find(
      (el) => el.getAttribute("aria-label") === "Year"
    );

    check("DOB inputs exist (test 4b)", !!(dayInput2 && monthInput2 && yearInput2));
    if (!dayInput2 || !monthInput2 || !yearInput2) {
      failures++;
      console.log("  ABORT: Missing DOB inputs");
      unmount2();
    } else {
      await userEvent.type(dayInput2, "12");
      await userEvent.type(monthInput2, "05");
      await userEvent.type(yearInput2, "1990");

      const maleButton2 = Array.from(container2.querySelectorAll('button')).find(
        (btn) => btn.textContent === "Male"
      );
      check("Male button exists (test 4b)", !!maleButton2);
      if (!maleButton2) {
        failures++;
        console.log("  ABORT: Missing Male button");
        unmount2();
      } else {
        await userEvent.click(maleButton2);

        // Type 3'0" (out of range height)
        const allInputs2 = Array.from(container2.querySelectorAll<HTMLInputElement>('input'));
        const heightInput2 = allInputs2.find(
          (el) => el.placeholder.includes("5'9")
        );
        const weightInput2 = allInputs2.find(
          (el) => el.placeholder.includes("154")
        );

        check("Height input exists (test 4b)", !!heightInput2);
        check("Weight input exists (test 4b)", !!weightInput2);
        if (!heightInput2 || !weightInput2) {
          failures++;
          console.log("  ABORT: Missing height/weight inputs");
          unmount2();
        } else {
          await userEvent.clear(heightInput2);
          await userEvent.type(heightInput2, "3'0\"");
          await userEvent.clear(weightInput2);
          await userEvent.type(weightInput2, "50");

          // Try to click Continue
          const continueButton2 = Array.from(container2.querySelectorAll("button")).find(
            (btn) => btn.textContent?.includes("Continue")
          );
          check("Continue button exists (test 4b)", !!continueButton2);
          if (!continueButton2) {
            failures++;
            console.log("  ABORT: Missing Continue button");
            unmount2();
          } else {
            await userEvent.click(continueButton2);
            await new Promise((resolve) => setTimeout(resolve, 200));

            const bodyText2 = container2.textContent || "";
            check(
              "Out-of-range height shows error message",
              bodyText2.includes("between 3'3\"") || bodyText2.includes("100 cm")
            );

            check(
              "Out-of-range weight shows error message",
              bodyText2.includes("between 55 and 661 lb") || bodyText2.includes("25 and 300 kg")
            );

            check(
              "saveAboutYou NOT called for out-of-range values",
              spy2.callCount === 0,
              `called ${spy2.callCount} times`
            );

            unmount2();
          }
        }
      }
    }
  }

  console.log("\n5. Rapid toggle serialization: multiple metric/imperial toggles with max 1 in flight");

  {
    let saveCallCount = 0;
    let inflightCount = 0;
    let maxInflightCount = 0;
    const saveResults: string[] = [];

    const mockActions: SettingsActions = {
      updateSessionSettings: async () => ({ ok: true }),
      updateProfileSettings: async (patch) => {
        inflightCount++;
        maxInflightCount = Math.max(maxInflightCount, inflightCount);
        saveCallCount++;
        
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        
        if (patch.units) {
          saveResults.push(patch.units);
        }
        
        inflightCount--;
        return { ok: true };
      },
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
      setEquipmentItem: async () => ({ ok: true }),
      setHasAllEquipment: async () => ({ ok: true }),
      setInjury: async () => ({ ok: true }),
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
      dateOfBirth: null,
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

    // Find Imperial button
    const imperialButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Imperial")
    );
    const metricButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Metric")
    );

    check("Found Imperial and Metric buttons", !!(imperialButton && metricButton));

    if (imperialButton && metricButton) {
      // Rapidly toggle: metric -> imperial -> metric -> imperial
      await userEvent.click(imperialButton);
      await userEvent.click(metricButton);
      await userEvent.click(imperialButton);
      await userEvent.click(metricButton);
      await userEvent.click(imperialButton);

      // Wait for all saves to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      check(
        "Max 1 request in flight at a time",
        maxInflightCount <= 1,
        `max in flight: ${maxInflightCount}`
      );

      check(
        "Final value is 'imperial' (last click)",
        saveResults[saveResults.length - 1] === "imperial",
        `got '${saveResults[saveResults.length - 1]}'`
      );

      check(
        "Save was coalesced (fewer saves than clicks)",
        saveCallCount < 5,
        `${saveCallCount} saves for 5 clicks`
      );
    }
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
