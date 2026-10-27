/**
 * M1 (BLOCKING): Verify that logging the prefilled lb value does NOT produce
 * a false PB when the snapped value is conservatively lower than the stored best.
 *
 * Scenario: User has a best of 62.5 kg. Imperial display snaps prescription
 * to 137.5 lb (62.37 kg). Logging the prefill should NOT toast "Heaviest set yet"
 * because 62.37 kg < 62.5 kg at 0.01 kg precision.
 */

import { snapPrescribedWeight, displayToKg, kgToDisplay, roundLbToHalf } from "../src/lib/units";

console.log("\nM1 (False PB): Logging prefill must not produce false PB\n");

const units = "imperial" as const;

// Step 1: User's stored best
const storedBestKg = 62.5;
console.log(`1. Stored best e1rm: ${storedBestKg} kg`);

// Step 2: Server prescribes the same weight (62.5 kg)
const prescribedKg = 62.5;
const snappedKg = snapPrescribedWeight(prescribedKg, units);
console.log(`\n2. Prescribed weight: ${prescribedKg} kg`);
console.log(`   Snapped to lb grid: ${snappedKg} kg`);

// Step 3: What the user sees in the input box
const displayLb = roundLbToHalf(kgToDisplay(snappedKg!, units));
console.log(`\n3. Input box prefill: ${displayLb} lb`);

if (displayLb !== 137.5) {
  console.error(`   ❌ FAIL: Expected 137.5 lb, got ${displayLb} lb`);
  process.exit(1);
}
console.log(`   ✓ PASS: Prefill is 137.5 lb`);

// Step 4: User logs the prefill without changing it
// The log path converts display value back to kg
const loggedKg = displayToKg(displayLb, units);
console.log(`\n4. User logs the prefill (${displayLb} lb):`);
console.log(`   Converts to: ${loggedKg} kg`);

// Step 5: Compare at 0.01 kg precision (numeric(6,2) in database)
const roundedLogged = Math.round(loggedKg * 100) / 100;
const roundedBest = Math.round(storedBestKg * 100) / 100;

console.log(`\n5. PB comparison at 0.01 kg precision:`);
console.log(`   Logged: ${roundedLogged} kg`);
console.log(`   Best:   ${roundedBest} kg`);

if (roundedLogged > roundedBest) {
  console.error(`   ❌ FAIL: False PB! ${roundedLogged} kg > ${roundedBest} kg`);
  console.error(`   This would toast "Heaviest set yet" when the user just logged the prefill.`);
  process.exit(1);
}

console.log(`   ✓ PASS: No PB (${roundedLogged} <= ${roundedBest})`);

// Step 6: Verify the snapped value is conservatively lower
if (snappedKg! >= storedBestKg) {
  console.error(`   ❌ FAIL: Snapped value ${snappedKg} kg should be < ${storedBestKg} kg`);
  process.exit(1);
}

console.log(`\n6. ✓ PASS: Snapped value (${snappedKg} kg) is conservatively lower than best (${storedBestKg} kg)`);

console.log("\n✅ M1 (False PB) PASS: Logging prefill does not produce false PB\n");