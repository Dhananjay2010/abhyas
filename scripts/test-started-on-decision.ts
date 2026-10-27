#!/usr/bin/env tsx
/**
 * Test the startedOn decision helper for block anchoring.
 * 
 * Block 1 anchors sign-up weekday for new users by setting started_on to today.
 * Rebuilds and rollover blocks (2+) omit started_on to preserve date logic.
 */

import { strict as assert } from "node:assert";
import { decideBlockStartedOn } from "../src/lib/program/persist";

const today = "2026-10-15";

// Test 1: new block 1 → today
{
  const result = decideBlockStartedOn({ blockNumber: 1, isRebuild: false, today });
  assert.equal(result, today, "new block 1 must anchor to today");
}

// Test 2: rebuild block 1 → undefined
{
  const result = decideBlockStartedOn({ blockNumber: 1, isRebuild: true, today });
  assert.equal(result, undefined, "rebuild block 1 must not anchor");
}

// Test 3: block 2 (rollover) → undefined
{
  const result = decideBlockStartedOn({ blockNumber: 2, isRebuild: false, today });
  assert.equal(result, undefined, "block 2 must not anchor");
}

// Test 4: block 3 (rollover) → undefined
{
  const result = decideBlockStartedOn({ blockNumber: 3, isRebuild: false, today });
  assert.equal(result, undefined, "block 3 must not anchor");
}

// Test 5: block 10 (rollover) → undefined
{
  const result = decideBlockStartedOn({ blockNumber: 10, isRebuild: false, today });
  assert.equal(result, undefined, "block 10 must not anchor");
}

console.log("✓ All startedOn decision tests passed");
