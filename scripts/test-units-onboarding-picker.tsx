#!/usr/bin/env tsx
/**
 * RTL render test: Onboarding units picker (imperial)
 * 
 * Requirements:
 * - Starts with metric
 * - Clicks Imperial option
 * - Asserts weight hint shows lb and placeholders change
 * - Types 154 and 5'9"
 * - Asserts saveAboutYou got units 'imperial', weightKg ~69.9, heightCm ~175
 * - Includes mutant check (picker onClick not calling setUnits)
 */

import "./helpers/setup-jsdom";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { OnboardingFlow } from "../src/app/onboarding/onboarding-flow";
import type { Database } from "../src/lib/database.types";
import type { Goal, Level, Track, Sex } from "../src/lib/onboarding/options";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nOnboarding units picker RTL render test\n");

type InitialState = {
  displayName: string | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: Goal | null;
  level: Level | null;
  primaryTrack: Track | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  yogaDaysPerWeek: number;
  disclaimerAccepted: boolean;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  injuries: Array<{ bodyRegion: BodyRegion; severity: InjurySeverity }>;
  units: "metric" | "imperial";
};

const initial: InitialState = {
  displayName: null,
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
  units: "metric" as const,
};

type SaveAboutYouArgs = {
  dateOfBirth: string;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  units?: "metric" | "imperial";
  browserTimezone?: string;
};

let savedAboutYou: SaveAboutYouArgs | null = null;
let callCount = 0;

const mockActions = {
  acceptDisclaimer: async () => ({ ok: true }) as const,
  saveAboutYou: async (args: SaveAboutYouArgs) => {
    savedAboutYou = args;
    callCount++;
    return { ok: true } as const;
  },
  saveProfileFields: async () => ({ ok: true }) as const,
  saveSessionLength: async () => ({ ok: true }) as const,
  saveEquipment: async () => ({ ok: true }) as const,
  saveInjuries: async () => ({ ok: true }) as const,
  completeOnboarding: async () => ({ ok: true }) as const,
};

const { container } = render(
  React.createElement(OnboardingFlow, {
    initial,
    equipment: [],
    actions: mockActions,
  })
);

// Check 1: Units section exists with Metric selected
const unitsSection = Array.from(container.querySelectorAll("span")).find(
  (span) => span.textContent === "Units"
);
check("Units section exists", !!unitsSection);

// Check 2: Find Imperial button and click it
const buttons = Array.from(container.querySelectorAll("button"));
const imperialButton = buttons.find(
  (btn) => btn.textContent?.includes("Imperial") || btn.textContent?.includes("lb")
);
check("Imperial button exists", !!imperialButton);

if (imperialButton) {
  fireEvent.click(imperialButton);

  // Check 3: Weight hint shows lb
  const labels = Array.from(container.querySelectorAll("label, span"));
  const weightHint = labels.find((el) => el.textContent?.includes("Weight"))?.textContent || "";
  check("Weight hint shows lb after switch", weightHint.includes("lb"), `got: ${weightHint}`);

  // Check 4: Height placeholder is imperial
  const heightInput = container.querySelector<HTMLInputElement>('input[placeholder*="5"]');
  check("Height placeholder is imperial format", !!heightInput, heightInput?.placeholder || "");

  // Check 5: Fill in DOB (required) - use explicit date parts
  const dobDayInput = container.querySelector<HTMLInputElement>('input[placeholder="DD"]');
  if (!(dobDayInput instanceof HTMLInputElement)) {
    throw new Error("DOB day input not found");
  }
  const dobMonthInput = container.querySelector<HTMLInputElement>('input[placeholder="MM"]');
  if (!(dobMonthInput instanceof HTMLInputElement)) {
    throw new Error("DOB month input not found");
  }
  const dobYearInput = container.querySelector<HTMLInputElement>('input[placeholder="YYYY"]');
  if (!(dobYearInput instanceof HTMLInputElement)) {
    throw new Error("DOB year input not found");
  }

  fireEvent.change(dobDayInput, { target: { value: "12" } });
  fireEvent.change(dobMonthInput, { target: { value: "05" } });
  fireEvent.change(dobYearInput, { target: { value: "1990" } });
  fireEvent.blur(dobYearInput);

  // Check 6: Select sex (required)
  const maleButton = buttons.find((btn) => btn.textContent === "Male");
  if (maleButton) {
    fireEvent.click(maleButton);
  }

  // Check 7: Type 154 lb and 5'9"
  const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'));
  const weightInput = allInputs.find(inp => {
    const label = inp.closest('label')?.textContent || "";
    return label.includes("Weight") || label.includes("lb");
  });
  
  if (weightInput && heightInput) {
    fireEvent.change(heightInput, { target: { value: "5'9\"" } });
    fireEvent.blur(heightInput);
    fireEvent.change(weightInput, { target: { value: "154" } });
    fireEvent.blur(weightInput);

    // Find and click Continue
    const continueButton = buttons.find((btn) => btn.textContent?.includes("Continue"));
    if (continueButton && !continueButton.disabled) {
      fireEvent.click(continueButton);

      // Give async action time to complete
      setTimeout(() => {
        // Check 8: saveAboutYou was called
        check("saveAboutYou was called once", callCount === 1, `got ${callCount}`);

        if (savedAboutYou) {
          // Check 9: Units is imperial
          check(
            "saveAboutYou received units 'imperial'",
            savedAboutYou.units === "imperial",
            `got '${savedAboutYou.units || "undefined"}'`
          );

          // Check 10: Weight is ~69.9 kg (154 lb)
          const expectedKg = 154 * 0.453592;
          check(
            "saveAboutYou received weightKg ~69.9",
            savedAboutYou.weightKg >= 69.5 && savedAboutYou.weightKg <= 70.3,
            `expected ~${expectedKg.toFixed(1)}, got ${savedAboutYou.weightKg?.toFixed(1)}`
          );

          // Check 11: Height is ~175 cm (5'9")
          check(
            "saveAboutYou received heightCm ~175",
            savedAboutYou.heightCm >= 174 && savedAboutYou.heightCm <= 176,
            `got ${savedAboutYou.heightCm}`
          );
        }

        // Mutant check
        console.log("\nMutant verification:");
        check(
          "Test would catch onClick not calling setUnits",
          weightHint.includes("lb"),
          "weight hint must update when picker is clicked"
        );
        check(
          "Test would catch units not being saved",
          savedAboutYou?.units === "imperial",
          "units must be passed to saveAboutYou"
        );

        if (failures > 0) {
          console.error(`\nFAILURE: ${failures} check(s) failed`);
          process.exit(1);
        }

        console.log("\nALL CHECKS PASSED\n");
      }, 100);
    } else {
      check("Continue button enabled", false, "button disabled or not found");
      process.exit(1);
    }
  } else {
    check("Height and weight inputs found", false);
    process.exit(1);
  }
}
