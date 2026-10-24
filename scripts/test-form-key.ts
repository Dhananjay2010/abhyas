/**
 * Test setFormKey helper.
 *
 *   npx tsx scripts/test-form-key.ts
 */
import { setFormKey } from "../src/lib/session/form-key";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nsetFormKey: basic behavior");
{
  const key1 = setFormKey("session-ex-1", "exercise-a", 1);
  check("returns a string", typeof key1 === "string", `got ${typeof key1}`);
  check("includes session exercise id", key1.includes("session-ex-1"), `got ${key1}`);
  check("includes exercise id", key1.includes("exercise-a"), `got ${key1}`);
  check("includes set number", key1.includes("1"), `got ${key1}`);
}

console.log("\nsetFormKey: uniqueness across swaps");
{
  const sessionExId = "se-123";
  const setNum = 2;
  
  // Before swap: exercise A
  const keyBefore = setFormKey(sessionExId, "ex-a", setNum);
  
  // After swap: exercise B (session exercise id stays same)
  const keyAfter = setFormKey(sessionExId, "ex-b", setNum);
  
  check("different exercises produce different keys",
    keyBefore !== keyAfter,
    `before=${keyBefore}, after=${keyAfter}`);
  
  check("key changes when exercise changes",
    !keyBefore.endsWith(keyAfter.slice(-5)),
    "exercise id must be in the key");
}

console.log("\nsetFormKey: same inputs produce same key");
{
  const key1 = setFormKey("se-1", "ex-1", 3);
  const key2 = setFormKey("se-1", "ex-1", 3);
  check("same inputs give same key", key1 === key2, `${key1} vs ${key2}`);
}

console.log("\nsetFormKey: different set numbers produce different keys");
{
  const key1 = setFormKey("se-1", "ex-1", 1);
  const key2 = setFormKey("se-1", "ex-1", 2);
  check("different set numbers give different keys",
    key1 !== key2,
    `set 1: ${key1}, set 2: ${key2}`);
}

console.log("\nsetFormKey: format verification");
{
  const key = setFormKey("abc", "def", 5);
  const parts = key.split(":");
  check("uses colon separator", parts.length === 3, `got ${parts.length} parts`);
  check("first part is session exercise id", parts[0] === "abc", `got ${parts[0]}`);
  check("second part is exercise id", parts[1] === "def", `got ${parts[1]}`);
  check("third part is set number", parts[2] === "5", `got ${parts[2]}`);
}

console.log("\nMutation guard: form key must include exerciseId");
{
  // This test verifies that exerciseId is part of the key, not just sessionExerciseId
  const withoutExerciseId = (sessionExId: string, setNum: number) => `${sessionExId}:${setNum}`;
  
  const correctKey = setFormKey("se-1", "ex-a", 1);
  const brokenKey = withoutExerciseId("se-1", 1);
  
  check("setFormKey includes exerciseId (not just sessionExerciseId:setNumber)",
    correctKey !== brokenKey,
    `correct=${correctKey}, broken=${brokenKey}`);
  
  // Swap simulation
  const beforeSwap = setFormKey("se-1", "ex-a", 1);
  const afterSwap = setFormKey("se-1", "ex-b", 1);
  const brokenAfterSwap = withoutExerciseId("se-1", 1);
  
  check("swap changes key when exerciseId is included",
    beforeSwap !== afterSwap,
    "exerciseId must be in key to clear form state on swap");
  
  check("broken key (without exerciseId) doesn't change on swap",
    brokenAfterSwap === withoutExerciseId("se-1", 1),
    "this is the bug: form state persists across swaps");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
