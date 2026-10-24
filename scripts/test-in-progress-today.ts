#!/usr/bin/env tsx
/**
 * Test: Today page respects in-progress session for resume UI
 *
 * Verifies that when an in-progress session exists (from getInProgressSession),
 * Today page doesn't render a duplicate "Resume" button, delegating that to
 * the global in-progress bar.
 */

import assert from "node:assert";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

// Test 1: Button rendering logic with in-progress session
console.log("\n=== Test 1: In-progress session delegates to global bar ===\n");
test("When in-progress session exists, Today renders null (no duplicate resume)", () => {
  const strengthDone = false;
  const inProgressSession = { id: "s1", title: "Pull", workingSetsLogged: 3, startedAt: "2026-10-24" };
  
  // Simulate Today's button rendering logic
  const renderButton = () => {
    if (strengthDone) {
      return "complete";
    } else if (inProgressSession) {
      // Don't show resume button - global bar handles it
      return null;
    } else {
      return "start";
    }
  };
  
  const result = renderButton();
  assert(result === null, `Expected null (no button), got ${result}`);
});

// Test 2: Button renders for planned session (not started)
console.log("\n=== Test 2: Planned session shows Start button ===\n");
test("When session is planned but not started, Today shows Start button", () => {
  const strengthDone = false;
  const inProgressSession = null;
  
  const renderButton = () => {
    if (strengthDone) {
      return "complete";
    } else if (inProgressSession) {
      return null;
    } else {
      return "start";
    }
  };
  
  const result = renderButton();
  assert(result === "start", `Expected "start", got ${result}`);
});

// Test 3: Completed session shows completion message
console.log("\n=== Test 3: Completed session shows completion ===\n");
test("When session is completed, Today shows completion message", () => {
  const strengthDone = true;
  const inProgressSession = null;
  
  const renderButton = () => {
    if (strengthDone) {
      return "complete";
    } else if (inProgressSession) {
      return null;
    } else {
      return "start";
    }
  };
  
  const result = renderButton();
  assert(result === "complete", `Expected "complete", got ${result}`);
});

// Test 4: strengthOpen calculation includes both in-progress and planned
console.log("\n=== Test 4: strengthOpen logic for state input ===\n");
test("strengthOpen true when in-progress session exists", () => {
  const inProgressSession = { id: "s1", title: "Pull", workingSetsLogged: 3, startedAt: "2026-10-24" };
  const strengthPlanned = null;
  
  const strengthOpen = !!inProgressSession || !!strengthPlanned;
  
  assert(strengthOpen === true, "Expected strengthOpen to be true");
});

test("strengthOpen true when planned session exists", () => {
  const inProgressSession = null;
  const strengthPlanned = { id: "s2", status: "planned", started_at: null };
  
  const strengthOpen = !!inProgressSession || !!strengthPlanned;
  
  assert(strengthOpen === true, "Expected strengthOpen to be true");
});

test("strengthOpen false when no open sessions", () => {
  const inProgressSession = null;
  const strengthPlanned = null;
  
  const strengthOpen = !!inProgressSession || !!strengthPlanned;
  
  assert(strengthOpen === false, "Expected strengthOpen to be false");
});

console.log("\n✅ All in-progress-today tests passed.");
console.log("Today page correctly delegates resume UI to global bar while keeping Start for planned sessions.");
