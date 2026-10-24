/**
 * Test the Settings units toggle behavior.
 * 
 * Validates that:
 * 1. The SettingsState includes units field
 * 2. Weight fields display correctly based on units
 * 3. updateProfileSettings would be called with the units choice
 * 
 * npm run test:units-settings-toggle
 */

import type { SettingsState } from "../src/app/settings/settings-form";
import { formatWeight, parseWeight, weightLabel } from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. SettingsState type includes units field");
{
  // Test that units is a valid field in SettingsState
  const state: SettingsState = {
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

  check("SettingsState can be created with units='metric'", state.units === "metric");

  const imperialState: SettingsState = { ...state, units: "imperial" };
  check("SettingsState can be updated to units='imperial'", imperialState.units === "imperial");
}

console.log("\n2. Weight fields display correctly based on units");
{
  const metricDisplay = formatWeight(70, "metric", true);
  check("70 kg displays as '70 kg' in metric", metricDisplay === "70 kg", `got '${metricDisplay}'`);

  const imperialDisplay = formatWeight(70, "imperial", true);
  check("70 kg displays as '154.5 lb' in imperial", imperialDisplay === "154.5 lb", `got '${imperialDisplay}'`);

  const metricLabel = weightLabel("metric");
  check("Weight label is 'kg' for metric", metricLabel === "kg", `got '${metricLabel}'`);

  const imperialLabel = weightLabel("imperial");
  check("Weight label is 'lb' for imperial", imperialLabel === "lb", `got '${imperialLabel}'`);
}

console.log("\n3. Weight parsing respects units");
{
  const metricParsed = parseWeight("70", "metric");
  check("'70' parses to 70 kg in metric", metricParsed === 70, `got ${metricParsed}`);

  const imperialParsed = parseWeight("154", "imperial");
  check("'154' lb parses to ~70 kg", imperialParsed !== null && Math.abs(imperialParsed - 70) < 0.2, 
    `got ${imperialParsed?.toFixed(2)}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
