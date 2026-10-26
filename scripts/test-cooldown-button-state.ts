import { isFinishDisabled, getFinishButtonText, getFinishWarningText } from "@/lib/session/finish-guard";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testBothButtonsDisabledWithPending() {
  console.log("\n▶ Testing both buttons disabled with pending sets...");
  
  const disabled = isFinishDisabled(2, false);
  
  assert(disabled, "Both buttons should be disabled with pending>0");
  console.log("  ✓ Both buttons (Done and Skip) disabled with pending>0");
}

function testBothButtonsEnabledWithZeroPending() {
  console.log("\n▶ Testing both buttons enabled with zero pending...");
  
  const disabled = isFinishDisabled(0, false);
  
  assert(!disabled, "Both buttons should be enabled with pending=0");
  console.log("  ✓ Both buttons enabled with pending=0");
}

function testBothButtonsDisabledWhenBusy() {
  console.log("\n▶ Testing both buttons disabled when busy...");
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disabled = isFinishDisabled(0, true);
  
  assert(disabled, "Both buttons should be disabled when busy");
  console.log("  ✓ Both buttons disabled when busy");
}

function testFinishButtonTextWithPending() {
  console.log("\n▶ Testing finish button text with pending...");
  
  const text = getFinishButtonText(2);
  
  assert(text.includes("Saving 2 sets"), "Should show saving status");
  console.log("  ✓ Button shows 'Saving N sets…' with pending>0");
}

function testFinishButtonTextWithZero() {
  console.log("\n▶ Testing finish button text with zero pending...");
  
  const text = getFinishButtonText(0);
  
  assert(text === "Done", "Should show 'Done'");
  console.log("  ✓ Button shows 'Done' with pending=0");
}

function testWarningTextWithPending() {
  console.log("\n▶ Testing warning text with pending...");
  
  const text = getFinishWarningText(2, false);
  
  assert(text !== null, "Should show warning");
  assert(text!.includes("syncing"), "Should mention syncing");
  console.log("  ✓ Warning shown with pending>0");
}

function testWarningTextWithZero() {
  console.log("\n▶ Testing warning text with zero pending...");
  
  const text = getFinishWarningText(0, false);
  
  assert(text === null, "Should show no warning");
  console.log("  ✓ No warning with pending=0");
}

console.log("Testing Cool-down Button State");
console.log("==============================");

try {
  testBothButtonsDisabledWithPending();
  testBothButtonsEnabledWithZeroPending();
  testBothButtonsDisabledWhenBusy();
  testFinishButtonTextWithPending();
  testFinishButtonTextWithZero();
  testWarningTextWithPending();
  testWarningTextWithZero();
  console.log("\n✅ All cool-down button tests passed\n");
} catch (err: any) {
  console.error(`\n❌ Test error: ${err.message}\n`);
  process.exit(1);
}
