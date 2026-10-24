#!/usr/bin/env tsx
/**
 * Render test: verify sticky bottom bar presence based on staleness.
 *
 * Run: npm run test:stale-bar-render
 */

import { readFileSync } from "fs";
import { join } from "path";

export {};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const settingsFormPath = join(process.cwd(), "src/app/settings/settings-form.tsx");
const settingsForm = readFileSync(settingsFormPath, "utf-8");

// Test: Bottom bar is conditionally rendered based on planStale
test("bottom bar renders when planStale is true", () => {
  // The bar should be wrapped in a conditional: {(planStale || rebuildSuccess || undoToast) && ...}
  assert(
    settingsForm.includes("{(planStale || rebuildSuccess || undoToast) && ("),
    "Bottom bar must be conditionally rendered based on planStale state"
  );
  
  // The planStale-specific content should be gated by {planStale && !rebuildSuccess && ...}
  assert(
    settingsForm.includes("{planStale && !rebuildSuccess && ("),
    "Stale prompt must only show when planStale is true and rebuild hasn't succeeded"
  );
});

// Test: Bottom bar uses fixed positioning with safe-area-inset-bottom
test("bottom bar uses fixed positioning and accounts for safe area", () => {
  assert(
    settingsForm.includes('className="fixed left-0 right-0'),
    "Bottom bar must use position:fixed"
  );
  
  assert(
    settingsForm.includes('bottom: "calc(4rem + env(safe-area-inset-bottom))"'),
    "Bottom bar must account for bottom nav (4rem) and safe-area-inset-bottom"
  );
});

// Test: Bottom bar uses branding color tokens
test("bottom bar uses branding color tokens", () => {
  // Check for branding tokens (not hardcoded colors)
  assert(
    settingsForm.includes("bg-surface") && settingsForm.includes("border-border"),
    "Bottom bar container must use bg-surface and border-border tokens"
  );
  
  assert(
    settingsForm.includes("border-accent") && 
    settingsForm.includes("bg-accent") && 
    settingsForm.includes("text-accent"),
    "Stale prompt must use accent color tokens"
  );
  
  assert(
    settingsForm.includes("border-success") && 
    settingsForm.includes("bg-success") && 
    settingsForm.includes("text-success"),
    "Success message must use success color tokens"
  );
});

// Test: Stale prompt has accessibility attributes
test("stale prompt has role=status and aria-live=polite", () => {
  // Find the planStale section and verify it has accessibility attributes
  const planStaleSection = settingsForm.match(
    /{planStale && !rebuildSuccess && \(([\s\S]*?)\s+<\/div>\s+\)\}/
  );
  
  assert(planStaleSection !== null, "Could not find planStale section");
  
  const content = planStaleSection![1];
  assert(
    content.includes('role="status"'),
    "Stale prompt must have role='status'"
  );
  
  assert(
    content.includes('aria-live="polite"'),
    "Stale prompt must have aria-live='polite'"
  );
});

// Test: Button text matches requirement
test("button label matches requirement", () => {
  assert(
    settingsForm.includes('label="Update my plan to apply this"'),
    "Button must use exact label: 'Update my plan to apply this'"
  );
});

// Test: Prompt text matches requirement
test("prompt text matches requirement", () => {
  assert(
    settingsForm.includes("Your plan doesn&apos;t include this change yet."),
    "Prompt must say: 'Your plan doesn't include this change yet.'"
  );
});

// Test: Bottom bar has high z-index
test("bottom bar has z-40 to stay above other content", () => {
  assert(
    settingsForm.includes("z-40"),
    "Bottom bar must have z-40 to appear above page content"
  );
});

// Test: Bar is rendered from server-derived state
test("bar uses server-derived initialPlanStale prop", () => {
  // Verify the component accepts initialPlanStale prop
  assert(
    settingsForm.includes("initialPlanStale"),
    "Component must accept initialPlanStale prop from server"
  );
  
  // Verify local state is initialized from server prop
  assert(
    settingsForm.includes("useState(initialPlanStale)"),
    "Client state must be initialized from server-rendered initialPlanStale"
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
