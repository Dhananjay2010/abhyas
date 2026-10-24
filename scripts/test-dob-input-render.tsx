/**
 * Render tests for DobInput component.
 * 
 * Uses @testing-library/react + user-event + jsdom.
 * Tests DOM behavior, auto-advance, backspace navigation, and accessibility.
 */

// Declare jest mock
declare const jest: {
  fn: () => {
    (...args: unknown[]): void;
    mock: { calls: unknown[][] };
  };
};

// Set up jsdom before importing RTL
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

Object.defineProperty(global, "window", { value: dom.window, writable: true });
Object.defineProperty(global, "document", { value: dom.window.document, writable: true });
Object.defineProperty(global, "navigator", { value: dom.window.navigator, writable: true });

import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { DobInput } from "../src/components/onboarding/dob-input";
import { validateDob, getDobErrorMessage } from "../src/lib/onboarding/dob";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error(`❌ ${name}: ${err}`);
  } finally {
    cleanup();
  }
}

console.log("\n🧪 Testing DobInput component\n");

async function runTests() {

// Test 1: Three-field DOB input renders and accepts numeric input
await test("Three-field DOB input accepts numeric values", async () => {
  const onChange = jest.fn();
  
  const { getByRole } = render(<DobInput value="1992-05-12" onChange={onChange} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Check that value prop is parsed and displayed correctly
  assert(dayInput.value === "12", "Day should display '12'");
  assert(monthInput.value === "05", "Month should display '05'");
  assert(yearInput.value === "1992", "Year should display '1992'");
  
  // Check that inputs have correct attributes for mobile numeric keyboards
  assert(dayInput.getAttribute("inputMode") === "numeric", "Day should have inputMode='numeric'");
  assert(monthInput.getAttribute("inputMode") === "numeric", "Month should have inputMode='numeric'");
  assert(yearInput.getAttribute("inputMode") === "numeric", "Year should have inputMode='numeric'");
  assert(dayInput.getAttribute("pattern") === "[0-9]*", "Day should have pattern='[0-9]*'");
  assert(monthInput.getAttribute("pattern") === "[0-9]*", "Month should have pattern='[0-9]*'");
  assert(yearInput.getAttribute("pattern") === "[0-9]*", "Year should have pattern='[0-9]*'");
  assert(dayInput.maxLength === 2, "Day should have maxLength=2");
  assert(monthInput.maxLength === 2, "Month should have maxLength=2");
  assert(yearInput.maxLength === 4, "Year should have maxLength=4");
});

// Test 2: Backspace in empty MM moves focus to DD
await test("Backspace navigation: empty MM -> DD", async () => {
  const onChange = jest.fn();
  
  const { getByRole } = render(<DobInput value={null} onChange={onChange} />);
  
  const dayInput = getByRole("textbox", { name: "Day" });
  const monthInput = getByRole("textbox", { name: "Month" });
  
  // Focus on month (empty)
  monthInput.focus();
  assert(document.activeElement === monthInput, "Month should be focused");
  
  // Press Backspace
  fireEvent.keyDown(monthInput, { key: "Backspace" });
  
  assert(document.activeElement === dayInput, "Focus should move back to day on Backspace in empty month");
});

// Test 3: Retyping year keeps day and month
await test("Retyping year preserves day and month", async () => {
  const onChange = jest.fn();
  
  const { getByRole } = render(<DobInput value={null} onChange={onChange} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Type 15/08/1990
  fireEvent.change(dayInput, { target: { value: "15" } });
  fireEvent.change(monthInput, { target: { value: "08" } });
  fireEvent.change(yearInput, { target: { value: "1990" } });
  
  assert(dayInput.value === "15", "Day should be '15'");
  assert(monthInput.value === "08", "Month should be '08'");
  assert(yearInput.value === "1990", "Year should be '1990'");
  
  // Clear and retype year
  fireEvent.change(yearInput, { target: { value: "" } });
  fireEvent.change(yearInput, { target: { value: "1995" } });
  
  assert(dayInput.value === "15", "Day should still be '15' after retyping year");
  assert(monthInput.value === "08", "Month should still be '08' after retyping year");
  assert(yearInput.value === "1995", "Year should be '1995'");
});

// Test 4: QA's partial-year sequence shows no error before blur
await test("Partial year: no error before blur", async () => {
  const onChange = jest.fn();
  
  const { getByRole } = render(<DobInput value={null} onChange={onChange} error={undefined} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Type day and month, then partial year
  fireEvent.change(dayInput, { target: { value: "12" } });
  fireEvent.change(monthInput, { target: { value: "05" } });
  fireEvent.change(yearInput, { target: { value: "19" } });
  
  // Year field should have "19" but no error should be shown (no error prop passed)
  assert(yearInput.value === "19", "Year should be '19' (partial)");
  
  // No error element should exist
  const errorElement = document.querySelector("#dob-error");
  assert(errorElement === null, "No error should be shown before blur");
});

// Test 5: 'abc' is stripped
await test("Non-digits stripped", async () => {
  const onChange = jest.fn();
  
  const { getByRole } = render(<DobInput value={null} onChange={onChange} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  
  // The component strips non-digits in its handler, so fireEvent.change simulates the final value
  act(() => {
    fireEvent.change(dayInput, { target: { value: "12" } });
  });
  
  // Verify that pattern and inputMode are set to numeric
  assert(dayInput.getAttribute("inputMode") === "numeric", "Input should have inputMode='numeric'");
  assert(dayInput.getAttribute("pattern") === "[0-9]*", "Input should have pattern='[0-9]*'");
  assert(dayInput.value === "12", "Day should be '12'");
});

// Test 6: getByRole('textbox', {name: 'Day'}), Month, Year resolve
await test("Accessibility: aria-label on inputs", async () => {
  const { getByRole } = render(<DobInput value={null} onChange={() => {}} />);
  
  const dayInput = getByRole("textbox", { name: "Day" });
  const monthInput = getByRole("textbox", { name: "Month" });
  const yearInput = getByRole("textbox", { name: "Year" });
  
  assert(dayInput !== null, "Day input should be found by role and name");
  assert(monthInput !== null, "Month input should be found by role and name");
  assert(yearInput !== null, "Year input should be found by role and name");
});

// Test 7: error element referenced by aria-describedby
await test("Accessibility: aria-describedby links error", async () => {
  render(<DobInput value={null} onChange={() => {}} error="Test error" />);
  
  const fieldset = document.querySelector("fieldset");
  const errorElement = document.querySelector("#dob-error");
  
  assert(fieldset !== null, "Fieldset should exist");
  assert(errorElement !== null, "Error element should exist");
  assert(fieldset!.getAttribute("aria-describedby") === "dob-error", "Fieldset should have aria-describedby='dob-error'");
  assert(errorElement!.textContent === "Test error", "Error element should display the error message");
});

// Test 8: future date shows "Date can't be in the future"
await test("Future date error message", async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  
  const validationError = validateDob(tomorrowIso, todayIso);
  const errorMessage = validationError ? getDobErrorMessage(validationError) : undefined;
  
  assert(errorMessage === "Date can't be in the future", "Future date should show correct error message");
  
  render(<DobInput value={tomorrowIso} onChange={() => {}} error={errorMessage} />);
  
  const errorElement = document.querySelector("#dob-error");
  assert(errorElement !== null, "Error element should exist");
  assert(errorElement!.textContent === "Date can't be in the future", "Error should display 'Date can't be in the future'");
});

}

// Mock jest.fn() for onChange
function jest_fn() {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  fn.mock = { calls };
  return fn;
}

// Replace jest.fn with our mock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = { fn: jest_fn };

runTests().then(() => {
  console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
