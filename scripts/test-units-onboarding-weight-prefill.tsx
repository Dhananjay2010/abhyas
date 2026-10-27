#!/usr/bin/env tsx
/**
 * M3 test: OnboardingFlow weight prefill preservation
 * 
 * Tests that when onboarding with initial.weightKg set:
 * - Metric: 82.1 kg prefills as "82.1", unedited saveAboutYou receives exactly 82.1 kg
 * - Imperial: 77.38 kg prefills as "170.6" (formatBodyWeight), unedited saveAboutYou receives exactly 77.38 kg
 */

import "./helpers/setup-jsdom";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingFlow, type InitialState, type OnboardingActions } from "../src/app/onboarding/onboarding-flow";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  ✗ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

console.log("\n=== OnboardingFlow weight prefill preservation ===\n");

(async () => {
  // Test 1: Metric 82.1 kg - complete form, submit, verify exact kg
  console.log("Test 1: Metric 82.1 kg prefills and submits exactly\n");
  {
    let capturedWeightKg: number | null = null;

    const initial: InitialState = {
      displayName: null,
      dateOfBirth: null,
      sex: null,
      heightCm: null,
      weightKg: 82.1,
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
      units: "metric",
    };

    const actions: OnboardingActions = {
      acceptDisclaimer: async () => ({ ok: true }),
      saveAboutYou: async (data) => {
        capturedWeightKg = data.weightKg;
        return { ok: true };
      },
      saveProfileFields: async () => ({ ok: true }),
      saveEquipment: async () => ({ ok: true }),
      saveInjuries: async () => ({ ok: true }),
      saveSessionLength: async () => ({ ok: true }),
      completeOnboarding: async () => ({ ok: true }),
    };

    const r = render(
      React.createElement(OnboardingFlow, {
        initial,
        equipment: [],
        actions,
      })
    );

    // Wait for about step
    await waitFor(() => {
      const headings = Array.from(r.container.querySelectorAll("h1, h2"));
      const hasAboutHeading = headings.some(h => {
        const text = h.textContent || "";
        return text.toLowerCase().includes("about");
      });
      if (!hasAboutHeading) throw new Error("About step not rendered");
    }, { timeout: 5000 });

    // Find weight input
    const weightInputs = Array.from(r.container.querySelectorAll<HTMLInputElement>("input[type='number']"));
    let weightInput: HTMLInputElement | null = null;
    for (const input of weightInputs) {
      const label = input.closest("label")?.textContent || "";
      const field = input.closest("div")?.querySelector("span")?.textContent || "";
      if (label.includes("Weight") || field.includes("Weight")) {
        weightInput = input;
        break;
      }
    }

    if (!weightInput) {
      check("Metric: Weight input found", false);
      failures++;
    } else {
      check("Metric: Weight input found", true);
      check("Metric: Prefill shows 82.1", weightInput.value === "82.1",
        `got "${weightInput.value}"`);

      // Fill other required fields
      const dobFieldset = r.container.querySelector("fieldset");
      if (dobFieldset) {
        const dobInputs = Array.from(dobFieldset.querySelectorAll<HTMLInputElement>("input"));
        if (dobInputs.length >= 3) {
          fireEvent.change(dobInputs[0], { target: { value: "15" } }); // day
          fireEvent.change(dobInputs[1], { target: { value: "01" } }); // month
          fireEvent.change(dobInputs[2], { target: { value: "1990" } }); // year
        }
      }

      // Select Male
      const buttons = Array.from(r.container.querySelectorAll("button"));
      const maleButton = buttons.find(b => b.textContent?.includes("Male"));
      if (maleButton) {
        fireEvent.click(maleButton);
      }

      // Fill height
      const textInputs = Array.from(r.container.querySelectorAll<HTMLInputElement>("input[type='text']"));
      const heightInput = textInputs.find(i => {
        const label = i.closest("label")?.textContent || "";
        const field = i.closest("div")?.querySelector("span")?.textContent || "";
        return label.includes("Height") || field.includes("Height");
      });
      if (heightInput) {
        fireEvent.change(heightInput, { target: { value: "175" } });
        fireEvent.blur(heightInput);
      }

      // Wait for validation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find and click Continue
      const continueButtons = buttons.filter(b => b.textContent === "Continue");
      const enabledContinue = continueButtons.find(b => !b.hasAttribute("disabled"));
      
      if (enabledContinue) {
        fireEvent.click(enabledContinue);

        // Wait for saveAboutYou to be called
        await waitFor(() => {
          if (capturedWeightKg === null) throw new Error("saveAboutYou not called");
        }, { timeout: 2000 });

        check("Metric: Unedited weight submits exactly 82.1 kg", capturedWeightKg === 82.1,
          `got ${capturedWeightKg}`);
      } else {
        check("Metric: Continue button enabled", false, "button not found or disabled");
        failures++;
      }
    }

    r.unmount();
  }

  // Test 2: Imperial 77.38 kg prefills as 170.6
  console.log("\nTest 2: Imperial 77.38 kg prefills as 170.6 and submits exactly 77.38 kg\n");
  {
    let capturedWeightKg2: number | null = null;

    const initial2: InitialState = {
      displayName: null,
      dateOfBirth: null,
      sex: null,
      heightCm: null,
      weightKg: 77.38,
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

    const actions2: OnboardingActions = {
      acceptDisclaimer: async () => ({ ok: true }),
      saveAboutYou: async (data) => {
        capturedWeightKg2 = data.weightKg;
        return { ok: true };
      },
      saveProfileFields: async () => ({ ok: true }),
      saveEquipment: async () => ({ ok: true }),
      saveInjuries: async () => ({ ok: true }),
      saveSessionLength: async () => ({ ok: true }),
      completeOnboarding: async () => ({ ok: true }),
    };

    const r2 = render(
      React.createElement(OnboardingFlow, {
        initial: initial2,
        equipment: [],
        actions: actions2,
      })
    );

    await waitFor(() => {
      const headings = Array.from(r2.container.querySelectorAll("h1, h2"));
      const hasAboutHeading = headings.some(h => {
        const text = h.textContent || "";
        return text.toLowerCase().includes("about");
      });
      if (!hasAboutHeading) throw new Error("About step not rendered");
    }, { timeout: 5000 });

    const weightInputs2 = Array.from(r2.container.querySelectorAll<HTMLInputElement>("input[type='number']"));
    let weightInput2: HTMLInputElement | null = null;
    for (const input of weightInputs2) {
      const label = input.closest("label")?.textContent || "";
      const field = input.closest("div")?.querySelector("span")?.textContent || "";
      if (label.includes("Weight") || field.includes("Weight")) {
        weightInput2 = input;
        break;
      }
    }

    if (!weightInput2) {
      check("Imperial: Weight input found", false);
      failures++;
    } else {
      check("Imperial: Weight input found", true);
      // 77.38 kg = 170.57 lb, formatBodyWeight rounds to 0.1 = 170.6 lb
      check("Imperial: Prefill shows 170.6", weightInput2.value === "170.6",
        `got "${weightInput2.value}"`);

      // Fill other required fields
      const dobFieldset2 = r2.container.querySelector("fieldset");
      if (dobFieldset2) {
        const dobInputs2 = Array.from(dobFieldset2.querySelectorAll<HTMLInputElement>("input"));
        if (dobInputs2.length >= 3) {
          fireEvent.change(dobInputs2[0], { target: { value: "15" } }); // day
          fireEvent.change(dobInputs2[1], { target: { value: "01" } }); // month
          fireEvent.change(dobInputs2[2], { target: { value: "1990" } }); // year
        }
      }

      const buttons2 = Array.from(r2.container.querySelectorAll("button"));
      const maleButton2 = buttons2.find(b => b.textContent?.includes("Male"));
      if (maleButton2) {
        fireEvent.click(maleButton2);
      }

      const textInputs2 = Array.from(r2.container.querySelectorAll<HTMLInputElement>("input[type='text']"));
      const heightInput2 = textInputs2.find(i => {
        const label = i.closest("label")?.textContent || "";
        const field = i.closest("div")?.querySelector("span")?.textContent || "";
        return label.includes("Height") || field.includes("Height");
      });
      if (heightInput2) {
        fireEvent.change(heightInput2, { target: { value: "5'9\"" } });
        fireEvent.blur(heightInput2);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const continueButtons2 = buttons2.filter(b => b.textContent === "Continue");
      const enabledContinue2 = continueButtons2.find(b => !b.hasAttribute("disabled"));
      
      if (enabledContinue2) {
        fireEvent.click(enabledContinue2);

        await waitFor(() => {
          if (capturedWeightKg2 === null) throw new Error("saveAboutYou not called");
        }, { timeout: 2000 });

        check("Imperial: Unedited weight submits exactly 77.38 kg", capturedWeightKg2 === 77.38,
          `got ${capturedWeightKg2}`);
      } else {
        check("Imperial: Continue button enabled", false, "button not found or disabled");
        failures++;
      }
    }

    r2.unmount();
  }

  if (failures === 0) {
    console.log(`\n✓ All onboarding weight prefill tests passed\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
})().catch(e => { 
  console.error("Test error:", e); 
  process.exit(1); 
});
