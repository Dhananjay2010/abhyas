/**
 * Controlled DobInput tests - reproduce the round-trip bug from PR #72 QA report.
 * 
 * Tests that a CONTROLLED parent (that feeds value back) doesn't break typing.
 */

// FIRST import: setup jsdom globals before React initializes
import "./helpers/setup-jsdom";

// THEN import React libraries
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import { DobInput } from "../src/components/onboarding/dob-input";

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

// Controlled harness that mimics onboarding-flow.tsx behavior
function ControlledHarness({ initialValue }: { initialValue: string | null }) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <div>
      <DobInput value={value} onChange={setValue} />
      <div data-testid="parent-value">{value ?? "null"}</div>
    </div>
  );
}

console.log("\n🧪 Testing DobInput controlled round-trip (PR #72 C1, M1)\n");

async function runTests() {

// Test C1: The CRITICAL bug - typing year digit-by-digit with controlled parent
// This test FAILS on main @ 26551fc (before the fix) and PASSES after PR #92
await test("C1: Typing year digit-by-digit with controlled parent", async () => {
  const { getByRole, getByTestId } = render(<ControlledHarness initialValue={null} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Type 12 in day
  fireEvent.change(dayInput, { target: { value: "12" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(dayInput.value === "12", "Day should be '12'");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (incomplete)");
  
  // Type 05 in month
  fireEvent.change(monthInput, { target: { value: "05" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(monthInput.value === "05", "Month should be '05'");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (incomplete)");
  
  // Type "1" in year - THIS IS THE CRITICAL BUG TEST
  // On main @ 26551fc: parent gets '0001-05-12', feeds it back, year becomes '0001'
  // After PR #92: parent gets null, year stays '1'
  fireEvent.change(yearInput, { target: { value: "1" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(yearInput.value === "1", "Year should be '1' (NOT '0001')");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (year < 4 digits)");
  
  // Continue typing: 19
  fireEvent.change(yearInput, { target: { value: "19" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(yearInput.value === "19", "Year should be '19' (NOT '0019')");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (year < 4 digits)");
  
  // 199
  fireEvent.change(yearInput, { target: { value: "199" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(yearInput.value === "199", "Year should be '199' (NOT '0199')");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (year < 4 digits)");
  
  // 1992 - NOW complete
  fireEvent.change(yearInput, { target: { value: "1992" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert(yearInput.value === "1992", "Year should be '1992'");
  assert(dayInput.value === "12", "Day should still be '12'");
  assert(monthInput.value === "05", "Month should still be '05'");
  assert(getByTestId("parent-value").textContent === "1992-05-12", "Parent should have complete ISO date");
});

// Test M1: Partial year (3 digits) - parent gets null
await test("M1: Typing partial year (199) - input shows '199', parent gets null", async () => {
  const { getByRole, getByTestId } = render(<ControlledHarness initialValue={null} />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Type 12/05/199 (partial year)
  fireEvent.change(dayInput, { target: { value: "12" } });
  fireEvent.change(monthInput, { target: { value: "05" } });
  fireEvent.change(yearInput, { target: { value: "199" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  assert(yearInput.value === "199", "Year should be '199' (partial, not padded)");
  assert(dayInput.value === "12", "Day should be '12'");
  assert(monthInput.value === "05", "Month should be '05'");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (incomplete)");
});

// Test M1: Backspace from 1992 to 199 - parent gets null
await test("M1: Backspace from 1992 to 199 - input shows '199', parent gets null", async () => {
  const { getByRole, getByTestId } = render(<ControlledHarness initialValue="1992-05-12" />);
  
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Initial state: "1992"
  assert(yearInput.value === "1992", "Initial year should be '1992'");
  assert(getByTestId("parent-value").textContent === "1992-05-12", "Initial parent should be '1992-05-12'");
  
  // Backspace to "199"
  fireEvent.change(yearInput, { target: { value: "199" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  assert(yearInput.value === "199", "After backspace, year should be '199' (not '0000' or '0199')");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (incomplete)");
});

// Test M1: Clearing the year - parent gets null
await test("M1: Clearing year - input empty, parent gets null", async () => {
  const { getByRole, getByTestId } = render(<ControlledHarness initialValue="1992-05-12" />);
  
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  // Initial state: "1992"
  assert(yearInput.value === "1992", "Initial year should be '1992'");
  assert(getByTestId("parent-value").textContent === "1992-05-12", "Initial parent should be '1992-05-12'");
  
  // Clear the year
  fireEvent.change(yearInput, { target: { value: "" } });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  
  assert(yearInput.value === "", "After clearing, year should be empty (not re-padded to '0000')");
  assert(getByTestId("parent-value").textContent === "null", "Parent should be null (incomplete)");
});

// Test: Valid prefilled value still displays correctly
await test("Valid prefilled value displays correctly", async () => {
  const { getByRole, getByTestId } = render(<ControlledHarness initialValue="1985-11-03" />);
  
  const dayInput = getByRole("textbox", { name: "Day" }) as HTMLInputElement;
  const monthInput = getByRole("textbox", { name: "Month" }) as HTMLInputElement;
  const yearInput = getByRole("textbox", { name: "Year" }) as HTMLInputElement;
  
  assert(dayInput.value === "03", "Prefilled day should be '03'");
  assert(monthInput.value === "11", "Prefilled month should be '11'");
  assert(yearInput.value === "1985", "Prefilled year should be '1985'");
  assert(getByTestId("parent-value").textContent === "1985-11-03", "Parent should have prefilled value");
});

}

runTests().then(() => {
  console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
});
