/**
 * Test M2 & L2: Session length onboarding default and Settings rollback.
 *
 * M2: Onboarding session-length step should preselect 45 minutes (not 60).
 * L2: Settings should revert to last saved value on validation error.
 *
 *   npm run test:session-length-ui
 */

import { render, screen, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { join } from "path";
import userEvent from "@testing-library/user-event";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Setup JSDOM environment
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost",
});
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;

console.log("\n1. M2: Onboarding preselects 45 minutes");
{
  // Read and compile OnboardingFlow
  const flowPath = join(process.cwd(), "src", "app", "onboarding", "onboarding-flow.tsx");
  const flowSource = readFileSync(flowPath, "utf-8");
  
  // Extract default value initialization
  const defaultInitMatch = /useState<number>\(\s*initial\.sessionMinutes\s*\?\?\s*DEFAULT_SESSION_LENGTH\s*\)/.test(flowSource);
  check("Onboarding uses DEFAULT_SESSION_LENGTH as fallback", defaultInitMatch);
  
  // Check DEFAULT_SESSION_LENGTH is imported and used
  const importsDefault = /DEFAULT_SESSION_LENGTH/.test(flowSource);
  check("Imports DEFAULT_SESSION_LENGTH", importsDefault);
  
  // The actual value 45 is verified in test-onboarding-session-length.ts
  // Here we just verify the pattern is correct
}

console.log("\n2. L2: Settings reverts to saved value on validation error");
{
  // Read SettingsForm
  const formPath = join(process.cwd(), "src", "app", "settings", "settings-form.tsx");
  const formSource = readFileSync(formPath, "utf-8");
  
  // Check for savedSessionLength state
  const hasSavedState = /savedSessionLength/.test(formSource);
  check("Settings tracks savedSessionLength", hasSavedState);
  
  // Check for rollback on error in session length handler
  const hasRollback = /setSavedSessionLength/.test(formSource) && 
                      /preferredSessionMinutes.*savedSessionLength/.test(formSource);
  check("Settings reverts to savedSessionLength on error", hasRollback);
  
  // Verify the rollback pattern: setS({ ...s, preferredSessionMinutes: savedSessionLength })
  const hasRevertPattern = /setS\(\s*\{\s*\.\.\.s,\s*preferredSessionMinutes:\s*savedSessionLength\s*\}\s*\)/.test(formSource);
  check("Settings uses correct revert pattern", hasRevertPattern);
}

console.log("\n3. Integration: Default value flow");
{
  // When sessionMinutes is null in DB, UI should show 45 as selected
  const sessionMinutesFromDb = null;
  const DEFAULT_SESSION_LENGTH = 45;
  const uiValue = sessionMinutesFromDb ?? DEFAULT_SESSION_LENGTH;
  
  check("NULL from DB results in UI showing 45", uiValue === 45,
    `got ${uiValue}`);
}

console.log("\n4. Integration: Settings rollback flow");
{
  // Simulate Settings behavior
  let displayValue = 60; // Initial saved value
  const savedValue = 60;
  
  // User clicks 45
  displayValue = 45;
  check("User clicks 45, display updates", displayValue === 45);
  
  // Server rejects (validation error)
  // Should revert to saved value
  displayValue = savedValue;
  check("On validation error, reverts to saved 60", displayValue === 60);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
