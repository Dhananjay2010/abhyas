/**
 * Test inline error behavior for height, weight, and yoga-days.
 *
 * Validates:
 * - Errors only show after blur or Continue, never while typing
 * - Touched flag per field
 *
 *   npm run test:onboarding-inline-errors
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

const equipment: EquipmentRow[] = [];

console.log("\n1. Height error only shows after blur");
{
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

  const heightInput = screen.getByPlaceholderText(/175/i) as HTMLInputElement;
  
  // Enter invalid height (too low)
  fireEvent.change(heightInput, { target: { value: "50" } });
  check("No error shown before blur", !screen.queryByText(/height should be/i));
  
  fireEvent.blur(heightInput);
  check("Error shown after blur", !!screen.queryByText(/height should be/i));
}

console.log("\n2. Weight error only shows after blur");
{
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

  const weightInput = screen.getByPlaceholderText(/70/i) as HTMLInputElement;
  
  // Enter invalid weight (too low)
  fireEvent.change(weightInput, { target: { value: "10" } });
  check("No error shown before blur", !screen.queryByText(/weight should be/i));
  
  fireEvent.blur(weightInput);
  check("Error shown after blur", !!screen.queryByText(/weight should be/i));
}

console.log("\n3. Yoga days error only shows after Continue click");
{
  const initialState: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-05-15",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "weights",
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

  // On the yoga mix step, no selection has been made
  check("No error shown initially", !screen.queryByText(/please select how many/i));
  
  const continueButton = screen.getByText(/continue/i);
  fireEvent.click(continueButton);
  
  check("Error shown after Continue click", !!screen.queryByText(/please select how many/i));
}

console.log("\n4. Errors don't show while typing");
{
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

  const heightInput = screen.getByPlaceholderText(/175/i) as HTMLInputElement;
  const weightInput = screen.getByPlaceholderText(/70/i) as HTMLInputElement;
  
  // Type invalid values
  fireEvent.change(heightInput, { target: { value: "5" } });
  fireEvent.change(heightInput, { target: { value: "50" } });
  fireEvent.change(weightInput, { target: { value: "1" } });
  fireEvent.change(weightInput, { target: { value: "10" } });
  
  check("No height error while typing", !screen.queryByText(/height should be/i));
  check("No weight error while typing", !screen.queryByText(/weight should be/i));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
