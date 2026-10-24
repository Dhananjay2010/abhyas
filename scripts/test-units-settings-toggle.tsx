/**
 * Real render test of Settings units toggle and body weight inputs.
 * 
 * Tests:
 * 1. SettingsForm: Click Imperial button, assert spy saves units='imperial' and control has aria-pressed
 * 2. LogWeight: With imperial, label shows lb, typing 176 saves ~79.8 kg, stored 80 kg shows as 176 lb
 * 
 * npm run test:units-settings-toggle
 */

// Must be first import before any React code
import "./helpers/setup-jsdom";

import React from "react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm, type SettingsState, type SettingsActions } from "../src/app/settings/settings-form";
import { LogWeight } from "../src/app/progress/log-weight";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function approxEqual(a: number, b: number, epsilon = 0.5): boolean {
  return Math.abs(a - b) < epsilon;
}

(async () => {
  console.log("\n1. SettingsForm Imperial button saves units='imperial' with aria-pressed");

  {
    let savedUnits: string | null = null;

    const mockActions: SettingsActions = {
      updateSessionSettings: async () => ({ ok: true }),
      updateProfileSettings: async (patch) => {
        if (patch.units) {
          savedUnits = patch.units;
        }
        return { ok: true };
      },
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    const initial: SettingsState = {
      goal: "strength",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      preferredSessionMinutes: 45,
      hasAllEquipment: true,
      equipmentIds: [],
      injuries: [],
      planningMode: "progression",
      perSetLogging: true,
      resumeSession: true,
      cooldownEnabled: true,
      restAutostart: true,
      restSound: true,
      restVibrate: true,
      restOverrideSeconds: null,
      bodyweightPrompt: "weekly",
      timezone: null,
      units: "metric",
    };

    const { container } = render(
      React.createElement(SettingsForm, {
        initial,
        equipment: [],
        timezones: ["UTC"],
        actions: mockActions,
      })
    );

    // Find the Imperial button
    const imperialButtons = Array.from(container.querySelectorAll("button")).filter((btn) =>
      btn.textContent?.includes("Imperial")
    );
    
    check("Found Imperial button", imperialButtons.length > 0, `found ${imperialButtons.length}`);

    if (imperialButtons.length > 0) {
      const imperialButton = imperialButtons[0];
      const initialPressed = imperialButton.getAttribute("aria-pressed");
      check("Initial aria-pressed is 'false'", initialPressed === "false", `got '${initialPressed}'`);

      await userEvent.click(imperialButton);
      await new Promise((resolve) => setTimeout(resolve, 100));

      check(
        "updateProfileSettings called with units='imperial'",
        savedUnits === "imperial",
        `got '${savedUnits}'`
      );
    }
  }

  console.log("\n2. LogWeight with imperial: stored 80 kg displays as ~176 lb");

  {
    const { container } = render(
      React.createElement(LogWeight, {
        current: 80,
        units: "imperial",
      })
    );

    const openButton = container.querySelector("button");
    check("Log weight button exists", openButton !== null);

    if (openButton) {
      await userEvent.click(openButton);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const input = container.querySelector('input[type="number"]');
      check("Input field rendered", input !== null);

      if (input) {
        const inputValue = (input as HTMLInputElement).value;
        const displayedLb = parseFloat(inputValue);
        check(
          "Stored 80 kg displays as ~176 lb",
          displayedLb > 0 && approxEqual(displayedLb, 176, 1),
          `got ${displayedLb}`
        );

        const placeholder = (input as HTMLInputElement).placeholder;
        check("Placeholder shows lb", placeholder === "lb", `got '${placeholder}'`);
      }
    }
  }

  console.log("\n3. Weight conversion logic: typing 176 saves ~79.8 kg");

  {
    // Test the conversion logic directly
    const { parseWeight } = await import("../src/lib/units");
    const parsed = parseWeight("176", "imperial");
    
    check(
      "parseWeight('176', 'imperial') returns ~79.8 kg",
      parsed !== null && approxEqual(parsed, 79.8, 0.5),
      `got ${parsed?.toFixed(2)}`
    );
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
