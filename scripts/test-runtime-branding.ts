/**
 * Test: Runtime gym branding - CSS variables and helpers
 *
 * Verifies:
 * - getBrandCssVariables produces valid CSS with all required variables
 * - accessibleTextColor returns deterministic black/white for contrast
 * - Brand name and field validation (via branding module exports)
 */

import { branding, getBrandCssVariables } from "../src/lib/branding";
import { accessibleTextColor } from "../src/lib/contrast";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

function runTests() {
  console.log("TEST: Base brand CSS variables structure");
  {
    const baseCss = getBrandCssVariables(branding);
    
    check("CSS is non-empty string", typeof baseCss === "string" && baseCss.length > 0);
    
    // Must contain all required variables
    const required = [
      "--color-accent:",
      "--color-accent-hover:",
      "--color-accent-fg:",
      "--color-bg:",
      "--color-surface:",
      "--color-surface-2:",
      "--color-border:",
      "--color-fg:",
      "--color-muted:",
      "--color-success:",
      "--color-warning:",
      "--color-warning-fg:",
      "--color-danger:",
      "--color-chart:",
    ];
    
    for (const varName of required) {
      check(`CSS includes ${varName}`, baseCss.includes(varName));
    }
    
    // Verify actual colors are present
    check("CSS contains branding accent color", baseCss.toLowerCase().includes(branding.colors.accent.toLowerCase()));
    check("CSS contains branding bg color", baseCss.toLowerCase().includes(branding.colors.bg.toLowerCase()));
  }
  console.log();

  console.log("TEST: accessibleTextColor returns valid contrast colors");
  {
    const lightAccent = "#ff9a2e";
    const darkAccent = "#1a1000";
    const lightFg = accessibleTextColor(lightAccent);
    const darkFg = accessibleTextColor(darkAccent);
    
    check("Light accent gets dark foreground", lightFg === "#000000");
    check("Dark accent gets light foreground", darkFg === "#ffffff");
    
    // Verify accessibleTextColor is deterministic
    const computed = accessibleTextColor(branding.colors.accent);
    check("accessibleTextColor returns black or white", 
      computed === "#000000" || computed === "#ffffff");
    
    // Verify same input = same output
    const computed2 = accessibleTextColor(branding.colors.accent);
    check("accessibleTextColor is deterministic", computed === computed2);
  }
  console.log();

  console.log("TEST: Base brand structure");
  {
    check("Base brand has name", typeof branding.name === "string" && branding.name.length > 0);
    check("Base brand name length valid", branding.name.length <= 100);
    check("Base brand has colors", typeof branding.colors === "object");
    check("Base brand has all required colors", Boolean(
      branding.colors.accent && 
      branding.colors.accentFg && 
      branding.colors.bg &&
      branding.colors.fg
    ));
    
    // All colors must be valid 6-digit hex
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const colorEntries = Object.entries(branding.colors);
    let allValid = true;
    for (const [key, value] of colorEntries) {
      if (typeof value === 'string' && !hexRegex.test(value)) {
        allValid = false;
        console.log(`    Invalid color ${key}: ${value}`);
      }
    }
    check("All base brand colors are valid hex", allValid);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

runTests();
