#!/usr/bin/env tsx
/**
 * Test LogWeight component validation messages by rendering with jsdom.
 *
 * Issue 5(a): Render LogWeight with jsdom, submit invalid weights,
 * and assert the correct error messages are shown.
 *
 *   npx tsx scripts/test-log-weight-render.tsx
 */

// Setup jsdom BEFORE importing React
import "../scripts/helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogWeight } from "../src/app/progress/log-weight";

let passed = 0;
let failed = 0;

console.log("\n🧪 Testing LogWeight validation messages\n");

async function runTests() {
  // Test 1: Imperial 55 lb shows error
  {
    const logAction = async () => ({ ok: true as const });
    
    const { getByRole, container } = render(
      <LogWeight
        current={null}
        units="imperial"
        logAction={logAction}
      />
    );
    
    // Click to open
    const openButton = getByRole("button", { name: /log today/i });
    await act(async () => {
      await userEvent.click(openButton);
    });
    
    // Enter invalid value
    const input = getByRole("spinbutton");
    await act(async () => {
      await userEvent.clear(input);
      await userEvent.type(input, "55");
    });
    
    // Click save and wait for validation
    const saveButton = getByRole("button", { name: /save/i });
    await act(async () => {
      await userEvent.click(saveButton);
      // Give startTransition time to flush
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Assert exact error text
    const alert = container.querySelector('[role="alert"]');
    if (!alert) {
      console.error("✗ Imperial: 55 lb shows 'Weight should be between 55.5 and 661 lb'");
      console.error("  Error alert not found");
      failed++;
    } else {
      const text = alert.textContent || "";
      if (text === "Weight should be between 55.5 and 661 lb") {
        console.log("✓ Imperial: 55 lb shows 'Weight should be between 55.5 and 661 lb'");
        passed++;
      } else {
        console.error("✗ Imperial: 55 lb shows 'Weight should be between 55.5 and 661 lb'");
        console.error(`  Expected: 'Weight should be between 55.5 and 661 lb'`);
        console.error(`  Got: '${text}'`);
        failed++;
      }
    }
    
    cleanup();
  }
  
  // Test 2: Metric 24 kg shows error
  {
    const logAction = async () => ({ ok: true as const });
    
    const { getByRole, container } = render(
      <LogWeight
        current={null}
        units="metric"
        logAction={logAction}
      />
    );
    
    // Click to open
    const openButton = getByRole("button", { name: /log today/i });
    await act(async () => {
      await userEvent.click(openButton);
    });
    
    // Enter invalid value
    const input = getByRole("spinbutton");
    await act(async () => {
      await userEvent.clear(input);
      await userEvent.type(input, "24");
    });
    
    // Click save and wait for validation
    const saveButton = getByRole("button", { name: /save/i });
    await act(async () => {
      await userEvent.click(saveButton);
      // Give startTransition time to flush
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Assert exact error text
    const alert = container.querySelector('[role="alert"]');
    if (!alert) {
      console.error("✗ Metric: 24 kg shows 'Weight should be between 25 and 300 kg'");
      console.error("  Error alert not found");
      failed++;
    } else {
      const text = alert.textContent || "";
      if (text === "Weight should be between 25 and 300 kg") {
        console.log("✓ Metric: 24 kg shows 'Weight should be between 25 and 300 kg'");
        passed++;
      } else {
        console.error("✗ Metric: 24 kg shows 'Weight should be between 25 and 300 kg'");
        console.error(`  Expected: 'Weight should be between 25 and 300 kg'`);
        console.error(`  Got: '${text}'`);
        failed++;
      }
    }
    
    cleanup();
  }
  
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
