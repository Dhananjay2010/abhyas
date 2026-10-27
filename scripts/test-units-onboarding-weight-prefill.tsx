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
import { render, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingFlow } from "../src/app/onboarding/onboarding-flow";
import type { Goal, Level, Track, Sex } from "../src/lib/onboarding/options";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== OnboardingFlow weight prefill preservation ===\n");

// Test 1: Metric 82.1 kg
console.log("Test 1: Metric 82.1 kg prefills and submits exactly");
{
  let capturedWeightKg: number | null = null;
  let capturedUnits: string | null = null;

  const initial = {
    goal: "build_muscle" as Goal,
    level: "beginner" as Level,
    track: "weights" as Track,
    sex: "male" as Sex,
    units: "metric" as const,
    weightKg: 82.1,
    heightCm: 175,
  };

  const actions = {
    saveAboutYou: async (data: { weightKg: number; heightCm: number; sex: Sex }) => {
      capturedWeightKg = data.weightKg;
      return { ok: true as const };
    },
    saveOnboarding: async (data: {
      goal: Goal;
      level: Level;
      track: Track;
      units: "metric" | "imperial";
      equipment_ids: string[];
      injuries: Array<{ region: string; severity: string }>;
    }) => {
      capturedUnits = data.units;
      return { ok: true as const, data: { ok: true as const, user_id: "u1" } };
    },
    setEquipment: async () => ({ ok: true as const }),
  };

  const r = render(
    <OnboardingFlow
      initial={initial}
      availableEquipment={[]}
      actions={actions}
    />
  );

  // Find weight input
  const weightInput = r.container.querySelector<HTMLInputElement>("input[type='text'][placeholder*='kg']");
  
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

    // Wait for saveAboutYou to be called
    setTimeout(() => {
      check("Metric: Unedited weight submits exactly 82.1 kg", capturedWeightKg === 82.1,
        capturedWeightKg === null ? "saveAboutYou not called" : `got ${capturedWeightKg}`);
      
      r.unmount();

      // Test 2: Imperial 77.38 kg
      console.log("\nTest 2: Imperial 77.38 kg prefills as 170.5 lb and submits exactly 77.38 kg");
      {
        let capturedWeightKg2: number | null = null;

        const initial2 = {
          goal: "build_muscle" as Goal,
          level: "beginner" as Level,
          track: "weights" as Track,
          sex: "male" as Sex,
          units: "imperial" as const,
          weightKg: 77.38,
          heightCm: 180,
        };

        const actions2 = {
          saveAboutYou: async (data: { weightKg: number; heightCm: number; sex: Sex }) => {
            capturedWeightKg2 = data.weightKg;
            return { ok: true as const };
          },
          saveOnboarding: async () => {
            return { ok: true as const, data: { ok: true as const, user_id: "u1" } };
          },
          setEquipment: async () => ({ ok: true as const }),
        };

        const r2 = render(
          <OnboardingFlow
            initial={initial2}
            availableEquipment={[]}
            actions={actions2}
          />
        );

        const weightInput2 = r2.container.querySelector<HTMLInputElement>("input[type='text'][placeholder*='lb']");
        
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
