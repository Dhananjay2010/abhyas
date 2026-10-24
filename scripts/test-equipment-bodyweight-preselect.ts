/**
 * Test equipment bodyweight preselection.
 *
 * Validates:
 * - Bodyweight track preselects bodyweight equipment
 * - Continue button is enabled when bodyweight is preselected
 *
 *   npm run test:equipment-bodyweight-preselect
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { OnboardingFlow, type InitialState, type EquipmentRow } from "../src/app/onboarding/onboarding-flow";
import type { ActionResult } from "../src/app/onboarding/actions";

// Mock Next.js router
const mockRouter = {
  push: () => {},
  refresh: () => {},
};

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Setup jsdom environment
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
});
global.window = dom.window as any;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Mock actions
const mockActions = {
  acceptDisclaimer: async () => ({ ok: true }) as ActionResult,
  saveAboutYou: async () => ({ ok: true }) as ActionResult,
  saveProfileFields: async () => ({ ok: true }) as ActionResult,
  saveEquipment: async () => ({ ok: true }) as ActionResult,
  saveInjuries: async () => ({ ok: true }) as ActionResult,
  completeOnboarding: async () => ({ ok: true }) as ActionResult,
};

const equipment: EquipmentRow[] = [
  { id: "bw-1", name: "Your body", category: "bodyweight" },
  { id: "bw-2", name: "Pull-up bar", category: "bodyweight" },
  { id: "fw-1", name: "Barbell", category: "free_weight" },
];

console.log("\n1. Bodyweight track preselects bodyweight equipment");
{
  const initialState: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-05-15",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "bodyweight",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
  };

  const { container } = render(
    createElement(OnboardingFlow, {
      initial: initialState,
      equipment,
      actions: mockActions,
    })
  );

  // Check if bodyweight equipment buttons are selected (pressed)
  const bodyButtons = screen.queryAllByRole("button", { pressed: true });
  check("Bodyweight equipment is preselected", bodyButtons.length >= 2,
    `found ${bodyButtons.length} selected buttons`);
  
  const continueButton = screen.getByText(/continue/i);
  check("Continue button is enabled", !continueButton.hasAttribute("disabled"));
}

console.log("\n2. Continue enabled immediately with preselected bodyweight");
{
  const initialState: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-05-15",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "bodyweight",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
  };

  const { container } = render(
    createElement(OnboardingFlow, {
      initial: initialState,
      equipment,
      actions: mockActions,
    })
  );

  const continueButton = screen.getByText(/continue/i);
  check("Continue is enabled without user interaction", !continueButton.hasAttribute("disabled"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
