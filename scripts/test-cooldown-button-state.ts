import { isFinishDisabled, getFinishButtonText, getFinishWarningText } from "@/lib/session/finish-guard";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testDoneDisabledWithPending() {
  console.log("\n▶ Testing Done button disabled with pending sets...");
  
  const disabled = isFinishDisabled(2, false);
  
  assert(disabled, "Done button should be disabled with pending sets");
  console.log("  ✓ Done button disabled with pending>0");
}

function testDoneEnabledWithZeroPending() {
  console.log("\n▶ Testing Done button enabled with zero pending...");
  
  const disabled = isFinishDisabled(0, false);
  
  assert(!disabled, "Done button should be enabled with zero pending");
  console.log("  ✓ Done button enabled with pending=0");
}

function testDoneDisabledWhenBusy() {
  console.log("\n▶ Testing Done button disabled when busy...");
  
  const disabled = isFinishDisabled(0, true);
  
  assert(disabled, "Done button should be disabled when busy");
  console.log("  ✓ Done button disabled when busy");
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
  assert(text.includes("syncing"), "Should mention syncing");
  console.log("  ✓ Warning shown with pending>0");
}

function testWarningTextWithZero() {
  console.log("\n▶ Testing warning text with zero pending...");
  
  const text = getFinishWarningText(0, false);
  
  assert(text === null, "Should show no warning");
  console.log("  ✓ No warning with pending=0");
}

console.log("Testing Cool-down Button State (Done/Finish only)");
console.log("=================================================");

try {
  testDoneDisabledWithPending();
  testDoneEnabledWithZeroPending();
  testDoneDisabledWhenBusy();
  testFinishButtonTextWithPending();
  testFinishButtonTextWithZero();
  testWarningTextWithPending();
  testWarningTextWithZero();
  console.log("\n✅ All cool-down button tests passed\n");
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Test error: ${message}\n`);
  process.exit(1);
}
