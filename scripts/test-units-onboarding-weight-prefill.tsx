#!/usr/bin/env tsx
/**
 * M3 test: OnboardingFlow weight prefill preservation
 * 
 * Tests that when onboarding with initial.weightKg set:
 * - Metric: 82.1 kg prefills as "82.1", unedited saveAboutYou receives exactly 82.1 kg
 * - Imperial: 77.38 kg prefills as "170.5 lb", unedited saveAboutYou receives exactly 77.38 kg
 */

import "./helpers/setup-jsdom";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { OnboardingFlow } from "../src/app/onboarding/onboarding-flow";
import type { Goal, Level, Track, Sex } from "../src/lib/onboarding/options";
import type { Database } from "../src/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== OnboardingFlow weight prefill preservation ===\n");

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

// Test 1: Metric 82.1 kg
console.log("Test 1: Metric 82.1 kg prefills and submits exactly");
{
  let capturedWeightKg: number | null = null;

  const initial: InitialState = {
    displayName: null,
    dateOfBirth: "1990-01-01",
    sex: "male" as Sex,
    heightCm: 175,
    weightKg: 82.1,
    goal: "build_muscle" as Goal,
    level: "beginner" as Level,
    primaryTrack: "weights" as Track,
    daysPerWeek: 3,
    sessionMinutes: 60,
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
    units: "metric" as const,
  };

  const actions = {
    acceptDisclaimer: async () => ({ ok: true as const }),
    saveAboutYou: async (data: { weightKg: number; heightCm: number; sex: Sex; dateOfBirth: string }) => {
      capturedWeightKg = data.weightKg;
      return { ok: true as const };
    },
    saveProfileFields: async () => ({ ok: true as const }),
    saveEquipment: async () => ({ ok: true as const }),
    saveInjuries: async () => ({ ok: true as const }),
    saveSessionLength: async () => ({ ok: true as const }),
    completeOnboarding: async () => ({ ok: true as const }),
  };

  const r = render(
    React.createElement(OnboardingFlow, {
      initial,
      equipment: [],
      actions,
    })
  );

  // Find weight input
  const weightInput = r.container.querySelector<HTMLInputElement>("input[type='number']");
  
  check("Metric: Weight input found", weightInput !== null);
  if (!weightInput) {
    failures++;
    console.log("  ✗ Weight input not found, cannot proceed");
  } else {
    check("Metric: Prefill shows 82.1", weightInput.value === "82.1",
      `got "${weightInput.value}"`);

    // Don't edit the weight, just click Continue
    const continueButton = r.getByText("Continue");
    fireEvent.click(continueButton);

    // Wait a tick for React to process
    setTimeout(() => {
      check("Metric: Unedited weight submits exactly 82.1 kg", capturedWeightKg === 82.1,
        capturedWeightKg === null ? "saveAboutYou not called" : `got ${capturedWeightKg}`);
      
      r.unmount();

      // Test 2: Imperial 77.38 kg
      console.log("\nTest 2: Imperial 77.38 kg prefills as 170.5 lb and submits exactly 77.38 kg");
      {
        let capturedWeightKg2: number | null = null;

        const initial2: InitialState = {
          displayName: null,
          dateOfBirth: "1990-01-01",
          sex: "male" as Sex,
          heightCm: 180,
          weightKg: 77.38,
          goal: "build_muscle" as Goal,
          level: "beginner" as Level,
          primaryTrack: "weights" as Track,
          daysPerWeek: 3,
          sessionMinutes: 60,
          yogaDaysPerWeek: 0,
          disclaimerAccepted: true,
          hasAllEquipment: false,
          equipmentIds: [],
          injuries: [],
          units: "imperial" as const,
        };

        const actions2 = {
          acceptDisclaimer: async () => ({ ok: true as const }),
          saveAboutYou: async (data: { weightKg: number; heightCm: number; sex: Sex; dateOfBirth: string }) => {
            capturedWeightKg2 = data.weightKg;
            return { ok: true as const };
          },
          saveProfileFields: async () => ({ ok: true as const }),
          saveEquipment: async () => ({ ok: true as const }),
          saveInjuries: async () => ({ ok: true as const }),
          saveSessionLength: async () => ({ ok: true as const }),
          completeOnboarding: async () => ({ ok: true as const }),
        };

        const r2 = render(
          React.createElement(OnboardingFlow, {
            initial: initial2,
            equipment: [],
            actions: actions2,
          })
        );

        const weightInput2 = r2.container.querySelector<HTMLInputElement>("input[type='number']");
        
        check("Imperial: Weight input found", weightInput2 !== null);
        if (!weightInput2) {
          failures++;
          console.log("  ✗ Weight input not found, cannot proceed");
        } else {
          // 77.38 kg = 170.57 lb, rounded to 0.5 lb = 170.5 lb
          check("Imperial: Prefill shows 170.5", weightInput2.value === "170.5",
            `got "${weightInput2.value}"`);

          const continueButton2 = r2.getByText("Continue");
          fireEvent.click(continueButton2);

          setTimeout(() => {
            check("Imperial: Unedited weight submits exactly 77.38 kg", capturedWeightKg2 === 77.38,
              capturedWeightKg2 === null ? "saveAboutYou not called" : `got ${capturedWeightKg2}`);
            
            r2.unmount();

            if (failures === 0) {
              console.log(`\n✓ All onboarding weight prefill tests passed\n`);
              process.exit(0);
            } else {
              console.log(`\n✗ ${failures} test(s) failed\n`);
              process.exit(1);
            }
          }, 100);
        }
      }
    }, 100);
  }
}
