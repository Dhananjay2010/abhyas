#!/usr/bin/env tsx
import { validateUserSettings } from "../src/app/actions";

let passedDOB = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passedDOB++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test Settings DOB null rejection\n");

async function runTests() {
  try {
    const result1 = await validateUserSettings({ date_of_birth: "1990-01-01" });
    assert(result1.ok === true, "DOB: Valid DOB is accepted");

    const result2 = await validateUserSettings({ date_of_birth: null });
    assert(result2.ok === false, "DOB: Setting DOB to null is rejected");
    assert("code" in result2 && result2.code === "DOB_REQUIRED", "DOB: Error code is DOB_REQUIRED");

    console.log(`\n✅ All assertions passed (${passedDOB})`);
    console.log("\nSettings DOB null-rejection test passed");
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Test failed: ${e}`);
    process.exit(1);
  }
}

runTests();
