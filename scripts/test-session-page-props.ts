#!/usr/bin/env tsx
import { deriveSessionProps } from "../src/app/session/[id]/session-page-props";

let passedN6 = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passedN6++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test N6/N6s/N8: deriveSessionProps\n");

async function runTests() {
  try {
    const sessionProps = deriveSessionProps(1);
    assert(sessionProps.isDeload === false, "N6: isDeload is false for regular week");

    const plannedProps = deriveSessionProps(4);
    assert(plannedProps.isDeload === true, "N8: isDeload is true for week 4");

    const skippedProps = deriveSessionProps(2);
    assert(skippedProps.isDeload === false, "N6s: isDeload is false for week 2");

    console.log(`\n✅ All assertions passed (${passedN6})`);
    console.log("\nMutation N6/N6s/N8 killed: deriveSessionProps computes isDeload correctly");
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Test failed: ${e}`);
    process.exit(1);
  }
}

runTests();
