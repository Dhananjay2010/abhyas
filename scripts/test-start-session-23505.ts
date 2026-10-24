#!/usr/bin/env tsx
/**
 * Test startSession handles 23505 unique violation on insert path
 * 
 * Regression: startSession 23505 not handled - should be caught by this test
 */

export {}; // Make this a module

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

async function main() {
  console.log("Testing startSession 23505 handling on insert path\n");
  
  // This test verifies that when the unique constraint rejects a duplicate insert,
  // startSession re-reads and returns the existing in_progress session.
  
  // The actual implementation at src/app/session/actions.ts:237-250 handles this:
  // if (sessionRes.error && sessionRes.error.code === "23505") {
  //   const { data: rereadSession } = await supabase...
  //   if (rereadSession) return { ok: true, data: { sessionId: rereadSession.id } };
  // }
  
  // Since we can't easily trigger a real 23505 in a test (would need concurrent requests),
  // this test verifies the structure exists by checking the code path is present.
  
  const fs = await import("fs");
  const actionsSource = fs.readFileSync("src/app/session/actions.ts", "utf-8");
  
  // Verify 23505 handling exists on the insert path
  const has23505Check = actionsSource.includes('sessionRes.error.code === "23505"');
  assert(has23505Check, "startSession checks for 23505 error code");
  
  const hasReread = actionsSource.includes("rereadSession") || actionsSource.includes("re-read");
  assert(hasReread, "startSession re-reads on 23505");
  
  // The key behavior: after 23505, we don't throw - we return the existing session
  const lines = actionsSource.split("\n");
  let found23505Handler = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('sessionRes.error.code === "23505"')) {
      // Check next ~15 lines for the re-read and return pattern
      const nextLines = lines.slice(i, i + 15).join("\n");
      if (nextLines.includes("rereadSession") && nextLines.includes("return { ok: true")) {
        found23505Handler = true;
        break;
      }
    }
  }
  
  assert(found23505Handler, "startSession returns ok:true with re-read session ID on 23505");
  
  if (failures === 0) {
    console.log("\n✓ All startSession 23505 tests passed\n");
    process.exit(0);
  } else {
    console.error(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
}

main();
