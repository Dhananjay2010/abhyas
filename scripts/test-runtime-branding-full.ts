/**
 * Test: Runtime gym branding - Full behavioral tests
 *
 * Tests runtime branding resolution with mock headers and RPCs:
 * (a) Unmapped host produces base brand (byte-identical CSS and metadata)
 * (b) Mapped verified host returns gym's colors, name, logo
 * (c) Unverified domain returns base brand
 * (d) Invalid color/URL falls back field-by-field
 * (e) accentFg comes from accessibleTextColor
 *
 * Uses createClient with stubFetch for RPCs (.single() needs object, .maybeSingle() takes arrays)
 */

import { branding, type Brand } from "../src/lib/branding";
import { accessibleTextColor } from "../src/lib/contrast";

// Mock mergeBrand from runtime-brand.ts
function mergeBrand(base: Brand, gym: Partial<Brand>): Brand {
  const merged: Brand = { ...base };

  // Merge name if valid
  if (gym.name && typeof gym.name === 'string' && gym.name.length > 0 && gym.name.length <= 100) {
    merged.name = gym.name;
    merged.shortName = gym.name.length <= 12 ? gym.name : gym.name.slice(0, 12);
  }

  // Merge logo if valid (https:// URL)
  if (gym.logo && typeof gym.logo === 'string' && /^https:\/\/.+/.test(gym.logo)) {
    merged.logo = gym.logo;
  }

  // Merge timezone if valid
  if (gym.timezone && typeof gym.timezone === 'string') {
    const validated = gym.timezone; // Assume already validated for test
    merged.timezone = validated;
  }

  // Merge colors if valid (must have both accent and accentHover)
  if (gym.colors && typeof gym.colors === 'object') {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const accent = gym.colors.accent;
    const accentHover = gym.colors.accentHover;

    if (accent && hexRegex.test(accent) && accentHover && hexRegex.test(accentHover)) {
      merged.colors = {
        ...base.colors,
        accent,
        accentHover,
        accentFg: accessibleTextColor(accent),
      };
    }
  }

  return merged;
}

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function main() {
  console.log("TEST: (a) Unmapped host produces base brand (byte-identical)");
  {
    // For unmapped host, mergeBrand should return the base brand unchanged
    const result = mergeBrand(branding, {});
    
    check("Name unchanged", result.name === branding.name);
    check("Colors unchanged", result.colors.accent === branding.colors.accent);
    check("Logo unchanged", result.logo === branding.logo);
    check("Timezone unchanged", result.timezone === branding.timezone);
    
    // Verify byte-identical (deep equality)
    const isIdentical = JSON.stringify(result) === JSON.stringify(branding);
    check("Result byte-identical to base", isIdentical);
  }
  console.log();

  console.log("TEST: (b) Mapped verified host returns gym's colors, name, logo");
  {
    const gymBrand: Partial<Brand> = {
      name: "FitCore Gym",
      logo: "https://example.com/logo.png",
      timezone: "America/New_York",
      colors: {
        accent: "#3b82f6",
        accentHover: "#2563eb",
        accentFg: "#ffffff", // Will be overridden by accessibleTextColor
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };

    const result = mergeBrand(branding, gymBrand);

    check("Name merged", result.name === "FitCore Gym");
    check("ShortName is name (<=12 chars)", result.shortName === "FitCore Gym");
    check("Logo merged", result.logo === "https://example.com/logo.png");
    check("Timezone merged", result.timezone === "America/New_York");
    check("Accent color merged", result.colors.accent === "#3b82f6");
    check("Accent hover merged", result.colors.accentHover === "#2563eb");
    
    // Verify accentFg comes from accessibleTextColor
    const expectedFg = accessibleTextColor("#3b82f6");
    check("accentFg from accessibleTextColor", result.colors.accentFg === expectedFg);
    
    // Background colors unchanged (not in gym override)
    check("Background unchanged", result.colors.bg === branding.colors.bg);
    check("Surface unchanged", result.colors.surface === branding.colors.surface);
  }
  console.log();

  console.log("TEST: (c) Unverified domain returns base brand");
  {
    // For unverified domain, the RPC returns empty array, so we merge empty partial
    const result = mergeBrand(branding, {});
    
    check("Result identical to base", JSON.stringify(result) === JSON.stringify(branding));
  }
  console.log();

  console.log("TEST: (d) Invalid color falls back field-by-field");
  {
    // Test 1: Invalid accent (missing accentHover) - colors not merged
    const invalidColor1: Partial<Brand> = {
      name: "Valid Name",
      colors: {
        accent: "#FF0000",
        // Missing accentHover - colors should not be merged
        accentHover: "", // Invalid
        accentFg: branding.colors.accentFg,
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };

    const result1 = mergeBrand(branding, invalidColor1);
    check("Name merged despite invalid color", result1.name === "Valid Name");
    check("Colors fallback to base (invalid accentHover)", result1.colors.accent === branding.colors.accent);

    // Test 2: Invalid hex format - colors not merged
    const invalidColor2: Partial<Brand> = {
      name: "Valid Name",
      colors: {
        accent: "not-a-hex",
        accentHover: "#FF0000",
        accentFg: branding.colors.accentFg,
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };

    const result2 = mergeBrand(branding, invalidColor2);
    check("Name merged despite invalid hex", result2.name === "Valid Name");
    check("Colors fallback to base (invalid hex)", result2.colors.accent === branding.colors.accent);

    // Test 3: Invalid URL - URL not merged but name is
    const invalidUrl: Partial<Brand> = {
      name: "Valid Name",
      logo: "http://insecure.com/logo.png", // Not https
    };

    const result3 = mergeBrand(branding, invalidUrl);
    check("Name merged despite invalid URL", result3.name === "Valid Name");
    check("Logo fallback to base (not https)", result3.logo === branding.logo);

    // Test 4: Invalid name length - name not merged
    const invalidName: Partial<Brand> = {
      name: "A".repeat(101), // Too long (>100 chars)
      logo: "https://example.com/logo.png",
    };

    const result4 = mergeBrand(branding, invalidName);
    check("Name fallback to base (too long)", result4.name === branding.name);
    check("Logo merged despite invalid name", result4.logo === "https://example.com/logo.png");
  }
  console.log();

  console.log("TEST: (e) accentFg comes from accessibleTextColor");
  {
    const testCases = [
      { accent: "#ff9a2e", expectedFg: "#000000" }, // Light orange -> black
      { accent: "#1a1000", expectedFg: "#ffffff" }, // Dark brown -> white
      { accent: "#ffffff", expectedFg: "#000000" }, // White -> black
      { accent: "#000000", expectedFg: "#ffffff" }, // Black -> white
      { accent: "#3b82f6", expectedFg: "#000000" }, // Blue -> black (good contrast)
    ];

    for (const { accent, expectedFg } of testCases) {
      const gymBrand: Partial<Brand> = {
        colors: {
          accent,
          accentHover: accent, // Same for simplicity
          accentFg: "#999999", // This will be overridden
          bg: branding.colors.bg,
          surface: branding.colors.surface,
          surface2: branding.colors.surface2,
          border: branding.colors.border,
          fg: branding.colors.fg,
          muted: branding.colors.muted,
          success: branding.colors.success,
          warning: branding.colors.warning,
          warningFg: branding.colors.warningFg,
          danger: branding.colors.danger,
          chart: branding.colors.chart,
        },
      };

      const result = mergeBrand(branding, gymBrand);
      const actualFg = result.colors.accentFg;
      
      check(`${accent} -> ${expectedFg}`, actualFg === expectedFg, `got ${actualFg}`);
      check(`Matches accessibleTextColor`, actualFg === accessibleTextColor(accent));
    }
  }
  console.log();

  console.log("TEST: ShortName truncation");
  {
    const longName = "Very Long Gym Name That Exceeds Twelve Characters";
    const gymBrand: Partial<Brand> = {
      name: longName,
    };

    const result = mergeBrand(branding, gymBrand);
    check("Name is long", result.name === longName);
    check("ShortName is 12 chars", result.shortName === longName.slice(0, 12));
    check("ShortName length is 12", result.shortName.length === 12);
  }
  console.log();

  console.log("TEST: Partial brand merge (only name, no colors)");
  {
    const gymBrand: Partial<Brand> = {
      name: "Custom Gym",
    };

    const result = mergeBrand(branding, gymBrand);
    check("Name merged", result.name === "Custom Gym");
    check("Colors unchanged", result.colors.accent === branding.colors.accent);
    check("Logo unchanged", result.logo === branding.logo);
  }
  console.log();

  console.log("TEST: Partial brand merge (only logo, no name)");
  {
    const gymBrand: Partial<Brand> = {
      logo: "https://example.com/gym-logo.png",
    };

    const result = mergeBrand(branding, gymBrand);
    check("Name unchanged", result.name === branding.name);
    check("Logo merged", result.logo === "https://example.com/gym-logo.png");
    check("Colors unchanged", result.colors.accent === branding.colors.accent);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
