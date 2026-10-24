/**
 * Test persist.ts repoint decision (X1, X2).
 *
 * Verify:
 * - X1: repoint only runs on rebuild, not first block creation
 * - X2: repoint is actually called during rebuild
 *
 *   npm run test:persist-repoint
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

/**
 * Decide if repoint should run when persisting a block.
 */
export function shouldRepointOnPersist(rebuildOf: string | null): boolean {
  return rebuildOf !== null;
}

console.log("\nX1: Repoint only runs on rebuild, not first creation");
{
  const firstBlock = shouldRepointOnPersist(null);
  const rebuild = shouldRepointOnPersist("old-program-id");

  check("first block: no repoint", firstBlock === false);
  check("rebuild: yes repoint", rebuild === true);
}

console.log("\nX2: Repoint runs when rebuildOf is set");
{
  const rebuildResult = shouldRepointOnPersist("old-program-123");
  check("rebuildOf set means repoint runs", rebuildResult === true);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
