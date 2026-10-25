/**
 * Test Item 1: Set numbering counts confirmed + pending sets
 * 
 * Bug: With expired session, logging 'Set 1 done' then 'Set 2 done' sent [1,1]
 * to replay, which dropped the second set's reps/weight.
 */

import { nextSetTarget } from "../src/lib/session/resume-state";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function testSetNumbering() {
  console.log("\n📋 Test set numbering with pending sets\n");
  
  const exercise = {
    id: "ex-1",
    exerciseId: "bench-press",
    name: "Bench Press",
    status: "pending" as const,
    sets: [] as Array<{ setNumber: number }>,
  };
  
  // Case 1: No confirmed, no pending → set 1
  const target1 = nextSetTarget([exercise], "ex-1", []);
  assert(target1 !== null, "Target 1 found");
  assert(target1.setNumber === 1, `Case 1: Expected set 1, got ${target1?.setNumber}`);
  
  // Case 2: No confirmed, 1 pending → set 2
  const pending1 = [{ sessionExerciseId: "ex-1", setNumber: 1 }];
  const target2 = nextSetTarget([exercise], "ex-1", pending1);
  assert(target2 !== null, "Target 2 found");
  assert(target2.setNumber === 2, `Case 2: Expected set 2, got ${target2?.setNumber}`);
  
  // Case 3: No confirmed, 2 pending → set 3
  const pending2 = [
    { sessionExerciseId: "ex-1", setNumber: 1 },
    { sessionExerciseId: "ex-1", setNumber: 2 },
  ];
  const target3 = nextSetTarget([exercise], "ex-1", pending2);
  assert(target3 !== null, "Target 3 found");
  assert(target3.setNumber === 3, `Case 3: Expected set 3, got ${target3?.setNumber}`);
  
  // Case 4: 1 confirmed, 1 pending → set 3
  const exerciseWithSet = {
    ...exercise,
    sets: [{ setNumber: 1 }],
  };
  const pending3 = [{ sessionExerciseId: "ex-1", setNumber: 2 }];
  const target4 = nextSetTarget([exerciseWithSet], "ex-1", pending3);
  assert(target4 !== null, "Target 4 found");
  assert(target4.setNumber === 3, `Case 4: Expected set 3, got ${target4?.setNumber}`);
  
  // Case 5: Pending for OTHER exercise doesn't affect this one
  const pending4 = [
    { sessionExerciseId: "ex-2", setNumber: 1 },
    { sessionExerciseId: "ex-2", setNumber: 2 },
  ];
  const target5 = nextSetTarget([exercise], "ex-1", pending4);
  assert(target5 !== null, "Target 5 found");
  assert(target5.setNumber === 1, `Case 5: Expected set 1, got ${target5?.setNumber}`);
  
  console.log("\n✅ All set numbering tests passed!");
}

(async () => {
  try {
    await testSetNumbering();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
})();
