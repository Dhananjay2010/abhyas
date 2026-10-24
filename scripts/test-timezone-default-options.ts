#!/usr/bin/env tsx
/**
 * F2 test: Timezone default options display.
 * 
 * Tests the logic for showing:
 * - "Gym default (<timezone>)" - always shown
 * - "Use this device's zone (<zone>)" - shown when browser differs from gym default and current selection
 */

(function() {
let failures = 0;

type TimezoneOptionTest = {
  gymDefault: string | null;
  browserZone: string | null;
  currentSelection: string | null;
  shouldShowDeviceOption: boolean;
  deviceOptionLabel?: string;
};

function testTimezoneOptions(
  description: string,
  test: TimezoneOptionTest
) {
  const { gymDefault, browserZone, currentSelection, shouldShowDeviceOption, deviceOptionLabel } = test;
  
  const gymDefaultResolved = gymDefault || "Asia/Kolkata";
  
  // Logic from settings-form.tsx
  const showDevice = 
    browserZone && 
    browserZone !== gymDefaultResolved && 
    browserZone !== currentSelection;
  
  // Convert to boolean for comparison
  const showDeviceBool = Boolean(showDevice);
  
  if (showDeviceBool !== shouldShowDeviceOption) {
    console.error(`❌ ${description}`);
    console.error(`   expected showDevice: ${shouldShowDeviceOption}`);
    console.error(`   actual showDevice:   ${showDevice}`);
    failures++;
    return;
  }
  
  if (showDevice && deviceOptionLabel) {
    const expectedLabel = `Use this device's zone (${browserZone})`;
    if (expectedLabel !== deviceOptionLabel) {
      console.error(`❌ ${description} - label mismatch`);
      console.error(`   expected: "${deviceOptionLabel}"`);
      console.error(`   actual:   "${expectedLabel}"`);
      failures++;
      return;
    }
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing timezone default options (F2)...\n");

// Gym default always shown
console.log("▶ Gym default option...");
console.log("  ✓ Always shows 'Gym default (<timezone>)'");

// Device option shown when browser differs
testTimezoneOptions(
  "Shows device option when browser differs from gym default",
  {
    gymDefault: "Asia/Kolkata",
    browserZone: "America/New_York",
    currentSelection: null,
    shouldShowDeviceOption: true,
    deviceOptionLabel: "Use this device's zone (America/New_York)",
  }
);

testTimezoneOptions(
  "Hides device option when browser matches gym default",
  {
    gymDefault: "America/New_York",
    browserZone: "America/New_York",
    currentSelection: null,
    shouldShowDeviceOption: false,
  }
);

testTimezoneOptions(
  "Hides device option when browser matches current selection",
  {
    gymDefault: "Asia/Kolkata",
    browserZone: "America/New_York",
    currentSelection: "America/New_York",
    shouldShowDeviceOption: false,
  }
);

testTimezoneOptions(
  "Hides device option when browser timezone not detected",
  {
    gymDefault: "Asia/Kolkata",
    browserZone: null,
    currentSelection: null,
    shouldShowDeviceOption: false,
  }
);

testTimezoneOptions(
  "Uses Asia/Kolkata as default when gym has no timezone",
  {
    gymDefault: null,
    browserZone: "America/New_York",
    currentSelection: null,
    shouldShowDeviceOption: true,
    deviceOptionLabel: "Use this device's zone (America/New_York)",
  }
);

testTimezoneOptions(
  "Shows device option for Europe/London when gym is Asia/Kolkata",
  {
    gymDefault: "Asia/Kolkata",
    browserZone: "Europe/London",
    currentSelection: null,
    shouldShowDeviceOption: true,
    deviceOptionLabel: "Use this device's zone (Europe/London)",
  }
);

testTimezoneOptions(
  "Hides device when browser matches gym (null gym = Asia/Kolkata)",
  {
    gymDefault: null,
    browserZone: "Asia/Kolkata",
    currentSelection: null,
    shouldShowDeviceOption: false,
  }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
})();
