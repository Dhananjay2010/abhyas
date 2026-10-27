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
  
  const exercise: {
    id: string;
    status: "pending";
    sets: { setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }[];
    plannedSets: number;
  } = {
    id: "ex-1",
    status: "pending",
    sets: [],
    plannedSets: 3,
  };
  
  // Case 1: No confirmed, no pending → set 1
  const target1 = nextSetTarget([exercise], "ex-1", []);
  assert(target1 !== null, "Target 1 found");
  if (!target1) throw new Error("Target 1 is null");
  assert(target1.setNumber === 1, "Target 1 setNumber is 1");
  
  // Case 2: No confirmed, 1 pending → set 2
  const pending1 = [{ sessionExerciseId: "ex-1", setNumber: 1 }];
  const target2 = nextSetTarget([exercise], "ex-1", pending1);
  assert(target2 !== null, "Target 2 found");
  if (!target2) throw new Error("Target 2 is null");
  assert(target2.setNumber === 2, "Target 2 setNumber is 2");
  
  // Case 3: No confirmed, 2 pending → set 3
  const pending2 = [
    { sessionExerciseId: "ex-1", setNumber: 1 },
    { sessionExerciseId: "ex-1", setNumber: 2 },
  ];
  const target3 = nextSetTarget([exercise], "ex-1", pending2);
  assert(target3 !== null, "Target 3 found");
  if (!target3) throw new Error("Target 3 is null");
  assert(target3.setNumber === 3, "Target 3 setNumber is 3");
  
  // Case 4: 1 confirmed, 1 pending → set 3
  const exerciseWithSet = {
    ...exercise,
    sets: [{ setNumber: 1, reps: null, weightKg: null, durationSeconds: null }],
  };
  const pending3 = [{ sessionExerciseId: "ex-1", setNumber: 2 }];
  const target4 = nextSetTarget([exerciseWithSet], "ex-1", pending3);
  assert(target4 !== null, "Target 4 found");
  if (!target4) throw new Error("Target 4 is null");
  assert(target4.setNumber === 3, "Target 4 setNumber is 3");
  
  // Case 5: Pending for OTHER exercise doesn't affect this one
  const pending4 = [
    { sessionExerciseId: "ex-2", setNumber: 1 },
    { sessionExerciseId: "ex-2", setNumber: 2 },
  ];
  const target5 = nextSetTarget([exercise], "ex-1", pending4);
  assert(target5 !== null, "Target 5 found");
  if (!target5) throw new Error("Target 5 is null");
  assert(target5.setNumber === 1, "Target 5 setNumber is 1");
  
  // Case 6: Gap case - confirmed [1,3] → gives 4
  const exerciseWithGap = {
    ...exercise,
    sets: [
      { setNumber: 1, reps: null, weightKg: null, durationSeconds: null },
      { setNumber: 3, reps: null, weightKg: null, durationSeconds: null },
    ],
  };
  const target6 = nextSetTarget([exerciseWithGap], "ex-1", []);
  assert(target6 !== null, "Target 6 found");
  if (!target6) throw new Error("Target 6 is null");
  assert(target6.setNumber === 4, "Target 6: Gap [1,3] gives next setNumber 4");
  
  // Case 7: 1 confirmed + 2 pending → gives 4
  const exerciseWith1Set = {
    ...exercise,
    sets: [{ setNumber: 1, reps: null, weightKg: null, durationSeconds: null }],
  };
  const pending5 = [
    { sessionExerciseId: "ex-1", setNumber: 2 },
    { sessionExerciseId: "ex-1", setNumber: 3 },
  ];
  const target7 = nextSetTarget([exerciseWith1Set], "ex-1", pending5);
  assert(target7 !== null, "Target 7 found");
  if (!target7) throw new Error("Target 7 is null");
  assert(target7.setNumber === 4, "Target 7: 1 confirmed + 2 pending gives setNumber 4");
  
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