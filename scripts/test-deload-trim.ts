/**
 * Test: Deload input validation and rep/hold trim
 *
 * L3: applyDeload must reject non-finite values and negative values
 * L2: On deload rows where sets aren't cut AND loadReducible is false
 *     AND metric is provided, trim reps/holds by ~1/3
 *
 * Key invariants:
 * - applyDeload throws on NaN, Infinity, -Infinity, and negative values
 * - applyDeload validates BEFORE rounding (catches -0.4, -0.5, etc.)
 * - 0 is allowed for backward compatibility
 * - All valid integers >= 0 produce the same result as before
 * - Rep trim: multiply by 2/3, round, minimum 1, preserve min ≤ max, cap at planned
 * - Hold trim: multiply by 2/3, round to nearest 5s, minimum 10s, cap at planned
 * - Trim only applies when sets weren't cut AND loadReducible === false AND metric is provided
 * - loadReducible undefined preserves exact backward compatibility
 * - metric undefined skips trim (prevents trimming holds as reps)
 *
 *   npm run test:deload-trim
 */
import {
  applyDeload,
  MAX_PLANNER_SETS,
  type Prescription,
} from "../src/lib/program/prescription";
import {
  resolveSessionTargets,
  type PlannedExercise,
} from "../src/lib/program/session-targets";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("\n1. applyDeload: exhaustive sweep sets 1-5 (MAX_PLANNER_SETS)");
{
  const cases = [
    { sets: 1, expected: 1 },
    { sets: 2, expected: 2 },
    { sets: 3, expected: 2 },
    { sets: 4, expected: 2 },
    { sets: 5, expected: 3 },
  ];

  for (const { sets, expected } of cases) {
    const p: Prescription = {
      sets,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
    };
    const result = applyDeload(p);
    const formula = Math.min(sets, Math.max(2, Math.round(sets * 0.6)));
    check(
      `applyDeload(${sets}) = ${expected}`,
      result.sets === expected && result.sets === formula,
      `got ${result.sets}, formula ${formula}`
    );
  }
}

console.log("\n2. applyDeload: bad input validation");
{
  const badInputs: Array<{ value: number; label: string }> = [
    { value: NaN, label: "NaN" },
    { value: Infinity, label: "Infinity" },
    { value: -Infinity, label: "-Infinity" },
    { value: -1, label: "-1" },
    { value: -0.4, label: "-0.4" },
    { value: -0.5, label: "-0.5" },
  ];

  for (const { value, label } of badInputs) {
    const p: Prescription = {
      sets: value,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
    };

    let threw = false;
    let threwRangeError = false;
    try {
      applyDeload(p);
    } catch (e) {
      threw = true;
      threwRangeError = e instanceof RangeError;
    }

    check(
      `applyDeload(${label}) throws RangeError`,
      threw && threwRangeError,
      threw
        ? threwRangeError
          ? ""
          : "threw but not RangeError"
        : "did not throw"
    );
  }

  // 0 is allowed (existing behavior)
  const zeroP: Prescription = { sets: 0, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const zeroResult = applyDeload(zeroP);
  check(
    "applyDeload(0) succeeds and returns 0",
    zeroResult.sets === 0,
    `got ${zeroResult.sets}`
  );

  // 0.5 rounds to 1
  const halfP: Prescription = { sets: 0.5, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const halfResult = applyDeload(halfP);
  check(
    "applyDeload(0.5) rounds to 1 and succeeds",
    halfResult.sets === 1,
    `got ${halfResult.sets}`
  );

  // -0 is normalized to 0
  const negZeroP: Prescription = { sets: -0, repsMin: 8, repsMax: 12, restSeconds: 90 };
  const negZeroResult = applyDeload(negZeroP);
  check(
    "applyDeload(-0) normalized to 0 and succeeds",
    negZeroResult.sets === 0,
    `got ${negZeroResult.sets}`
  );
}

console.log("\n2a. applyDeload: upper bound validation (L2 from QA)");
{
  // Maximum is accepted
  const maxP: Prescription = {
    sets: MAX_PLANNER_SETS,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
  };
  
  let maxThrew = false;
  let maxResult;
  try {
    maxResult = applyDeload(maxP);
  } catch {
    maxThrew = true;
  }
  
  check(
    `applyDeload(${MAX_PLANNER_SETS}) succeeds`,
    !maxThrew && maxResult !== undefined,
    maxThrew ? "threw unexpectedly" : ""
  );
  
  if (maxResult) {
    const expectedMax = 3;
    check(
      `applyDeload(${MAX_PLANNER_SETS}) = ${expectedMax}`,
      maxResult.sets === expectedMax,
      `got ${maxResult.sets}`
    );
  }
  
  // Maximum + 1 clamps to MAX_PLANNER_SETS
  const overMaxP: Prescription = {
    sets: MAX_PLANNER_SETS + 1,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
  };
  
  let overMaxThrew = false;
  try {
    applyDeload(overMaxP);
  } catch {
    overMaxThrew = true;
  }
  
  check(
    `applyDeload(${MAX_PLANNER_SETS + 1}) clamps to ${MAX_PLANNER_SETS} then deloads to 3`,
    !overMaxThrew && applyDeload(overMaxP).sets === 3,
    overMaxThrew
      ? "threw (should clamp instead)"
      : applyDeload(overMaxP).sets === 3
        ? ""
        : `got ${applyDeload(overMaxP).sets}`
  );
  
  // 1e308 clamps to MAX_PLANNER_SETS
  const hugeP: Prescription = {
    sets: 1e308,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
  };
  
  let hugeThrew = false;
  try {
    applyDeload(hugeP);
  } catch {
    hugeThrew = true;
  }
  
  check(
    "applyDeload(1e308) clamps to MAX_PLANNER_SETS then deloads to 3",
    !hugeThrew && applyDeload(hugeP).sets === 3,
    hugeThrew
      ? "threw (should clamp instead)"
      : applyDeload(hugeP).sets === 3
        ? ""
        : `got ${applyDeload(hugeP).sets}`
  );
  
  // Maximum + 0.4: rounds to 5, which is at the boundary
  // Validation happens BEFORE rounding, so 5.4 > 5 and should throw
  const nearMaxP: Prescription = {
    sets: MAX_PLANNER_SETS + 0.4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 90,
  };
  
  let nearMaxThrew = false;
  try {
    applyDeload(nearMaxP);
  } catch {
    nearMaxThrew = true;
  }
  
  check(
    `applyDeload(${MAX_PLANNER_SETS + 0.4}) clamps to ${MAX_PLANNER_SETS} before rounding, then deloads to 3`,
    !nearMaxThrew && applyDeload(nearMaxP).sets === 3,
    nearMaxThrew
      ? "threw (should clamp instead)"
      : applyDeload(nearMaxP).sets === 3
        ? ""
        : `got ${applyDeload(nearMaxP).sets}`
  );
  
  // Test 6-10 all clamp to MAX_PLANNER_SETS
  for (let sets = 6; sets <= 10; sets++) {
    const p: Prescription = {
      sets,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
    };
    
    let threw = false;
    let result;
    try {
      result = applyDeload(p);
    } catch {
      threw = true;
    }
    
    check(
      `applyDeload(${sets}) clamps to ${MAX_PLANNER_SETS} then deloads to 3`,
      !threw && !!result && result.sets === 3,
      threw ? "threw (should clamp instead)" : (result ? (result.sets === 3 ? "" : `got ${result.sets}`) : "no result")
    );
  }
}

console.log("\n3. Rep trim: 2-set bodyweight reps 8-12 becomes 5-8");
{
  const planned: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 60,
  };

  const result = resolveSessionTargets(planned, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 2 sets stays 2 (not cut), so trim applies
  // 8 * 2/3 = 5.33 → 5
  // 12 * 2/3 = 8
  check("Rep trim: sets unchanged", result.sets === 2, `got ${result.sets}`);
  check(
    "Rep trim: 8 → 5",
    result.repsMin === 5,
    `got ${result.repsMin}`
  );
  check(
    "Rep trim: 12 → 8",
    result.repsMax === 8,
    `got ${result.repsMax}`
  );
}

console.log("\n4. Hold trim: 30s becomes 20s, 10s stays 10s");
{
  const planned30: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 30,
    target_reps_max: 30,
    rest_seconds: 60,
  };

  const result30 = resolveSessionTargets(planned30, {
    isDeload: true,
    loadReducible: false,
    metric: "seconds",
  });

  // 30 * 2/3 = 20, round to nearest 5 = 20
  check(
    "Hold trim: 30s → 20s",
    result30.repsMin === 20 && result30.repsMax === 20,
    `got ${result30.repsMin}-${result30.repsMax}`
  );

  const planned10: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 10,
    target_reps_max: 10,
    rest_seconds: 60,
  };

  const result10 = resolveSessionTargets(planned10, {
    isDeload: true,
    loadReducible: false,
    metric: "seconds",
  });

  // 10 * 2/3 = 6.67 → 7 → round to nearest 5 = 5, but minimum is 10
  check(
    "Hold trim: 10s stays 10s (minimum)",
    result10.repsMin === 10 && result10.repsMax === 10,
    `got ${result10.repsMin}-${result10.repsMax}`
  );
}

console.log("\n5. Rep trim: minimum of 1 preserved");
{
  const planned: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 1,
    target_reps_max: 2,
    rest_seconds: 60,
  };

  const result = resolveSessionTargets(planned, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 1 * 2/3 = 0.67 → 1 (minimum)
  // 2 * 2/3 = 1.33 → 1
  check(
    "Rep trim: 1 stays 1",
    result.repsMin === 1,
    `got ${result.repsMin}`
  );
  check(
    "Rep trim: 2 → 1",
    result.repsMax === 1,
    `got ${result.repsMax}`
  );
  check(
    "Rep trim: min ≤ max preserved",
    result.repsMin <= result.repsMax,
    `${result.repsMin} > ${result.repsMax}`
  );

  // Critical: 0-rep case to catch floor mutant
  const plannedZero: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 0,
    target_reps_max: 1,
    rest_seconds: 60,
  };

  const resultZero = resolveSessionTargets(plannedZero, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 0 * 2/3 = 0 → must become 1 (minimum)
  // 1 * 2/3 = 0.67 → must become 1 (minimum)
  check(
    "Rep trim: 0 becomes 1 (floor mutant killer)",
    resultZero.repsMin === 1,
    `got ${resultZero.repsMin}`
  );
  check(
    "Rep trim: 0-1 becomes 1-1",
    resultZero.repsMin === 1 && resultZero.repsMax === 1,
    `got ${resultZero.repsMin}-${resultZero.repsMax}`
  );
}

console.log("\n6. Known-weight rows get no trim (loadReducible undefined)");
{
  // Critical: loadReducible undefined WITH metric provided must skip trim
  // This catches incorrect behavior when loadReducible is undefined
  const plannedReps: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  };

  const resultRepsWithMetric = resolveSessionTargets(plannedReps, {
    isDeload: true,
    // loadReducible omitted = undefined
    metric: "reps",
  });

  check(
    "loadReducible undefined + metric='reps': reps unchanged",
    resultRepsWithMetric.repsMin === 8 && resultRepsWithMetric.repsMax === 12,
    `got ${resultRepsWithMetric.repsMin}-${resultRepsWithMetric.repsMax}, expected 8-12`
  );

  const plannedHold: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 40,
    target_reps_max: 40,
    rest_seconds: 60,
  };

  const resultHoldWithMetric = resolveSessionTargets(plannedHold, {
    isDeload: true,
    // loadReducible omitted = undefined
    metric: "seconds",
  });

  check(
    "loadReducible undefined + metric='seconds': hold unchanged",
    resultHoldWithMetric.repsMin === 40 && resultHoldWithMetric.repsMax === 40,
    `got ${resultHoldWithMetric.repsMin}s, expected 40s`
  );

  // Without metric provided at all
  const resultUndefined = resolveSessionTargets(plannedReps, {
    isDeload: true,
    // loadReducible omitted, metric omitted
  });

  check(
    "loadReducible undefined + metric undefined: reps unchanged",
    resultUndefined.repsMin === 8 && resultUndefined.repsMax === 12,
    `got ${resultUndefined.repsMin}-${resultUndefined.repsMax}`
  );

  const resultTrue = resolveSessionTargets(plannedReps, {
    isDeload: true,
    loadReducible: true,
    metric: "reps",
  });

  check(
    "loadReducible true: reps unchanged",
    resultTrue.repsMin === 8 && resultTrue.repsMax === 12,
    `got ${resultTrue.repsMin}-${resultTrue.repsMax}`
  );
}

console.log("\n7. Sets-cut rows get no trim");
{
  const planned: PlannedExercise = {
    target_sets: 5, // becomes 3 on deload
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  };

  const result = resolveSessionTargets(planned, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  check(
    "Sets-cut: 5 → 3 sets",
    result.sets === 3,
    `got ${result.sets}`
  );
  check(
    "Sets-cut: reps unchanged despite loadReducible=false",
    result.repsMin === 8 && result.repsMax === 12,
    `got ${result.repsMin}-${result.repsMax}`
  );
}

console.log("\n8. Non-deload rows get no trim");
{
  const planned: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 60,
  };

  const result = resolveSessionTargets(planned, {
    isDeload: false,
    loadReducible: false,
    metric: "reps",
  });

  check(
    "Non-deload: sets unchanged",
    result.sets === 2,
    `got ${result.sets}`
  );
  check(
    "Non-deload: reps unchanged",
    result.repsMin === 8 && result.repsMax === 12,
    `got ${result.repsMin}-${result.repsMax}`
  );
}

console.log("\n9. loadReducible undefined: exact backward compatibility sweep");
{
  for (let sets = 1; sets <= MAX_PLANNER_SETS; sets++) {
    const planned: PlannedExercise = {
      target_sets: sets,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    };

    const withUndefined = resolveSessionTargets(planned, {
      isDeload: true,
      // loadReducible omitted
    });

    const legacy = applyDeload({
      sets,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
    });

    check(
      `Backward compat: ${sets} sets gives identical output`,
      withUndefined.sets === legacy.sets &&
        withUndefined.repsMin === legacy.repsMin &&
        withUndefined.repsMax === legacy.repsMax &&
        withUndefined.restSeconds === legacy.restSeconds,
      `new: ${withUndefined.sets}/${withUndefined.repsMin}-${withUndefined.repsMax}, legacy: ${legacy.sets}/${legacy.repsMin}-${legacy.repsMax}`
    );
  }
}

console.log("\n10. Rep trim: various rep ranges");
{
  const cases = [
    { min: 3, max: 6, expectedMin: 2, expectedMax: 4 }, // strength
    { min: 12, max: 15, expectedMin: 8, expectedMax: 10 }, // fat loss
    { min: 15, max: 20, expectedMin: 10, expectedMax: 13 },
  ];

  for (const { min, max, expectedMin, expectedMax } of cases) {
    const planned: PlannedExercise = {
      target_sets: 2,
      target_reps_min: min,
      target_reps_max: max,
      rest_seconds: 90,
    };

    const result = resolveSessionTargets(planned, {
      isDeload: true,
      loadReducible: false,
      metric: "reps",
    });

    check(
      `Rep trim: ${min}-${max} → ${expectedMin}-${expectedMax}`,
      result.repsMin === expectedMin && result.repsMax === expectedMax,
      `got ${result.repsMin}-${result.repsMax}`
    );
  }
}

console.log("\n11. Hold trim: various hold durations");
{
  const cases = [
    { hold: 15, expected: 10 }, // 15 * 2/3 = 10
    { hold: 20, expected: 15 }, // 20 * 2/3 = 13.33 → 15 (nearest 5)
    { hold: 40, expected: 25 }, // 40 * 2/3 = 26.67 → 25 (nearest 5)
    { hold: 60, expected: 40 }, // 60 * 2/3 = 40
    { hold: 12, expected: 10 }, // 12 * 2/3 = 8 → 10 (minimum)
  ];

  for (const { hold, expected } of cases) {
    const planned: PlannedExercise = {
      target_sets: 2,
      target_reps_min: hold,
      target_reps_max: hold,
      rest_seconds: 60,
    };

    const result = resolveSessionTargets(planned, {
      isDeload: true,
      loadReducible: false,
      metric: "seconds",
    });

    check(
      `Hold trim: ${hold}s → ${expected}s`,
      result.repsMin === expected && result.repsMax === expected,
      `got ${result.repsMin}s`
    );
  }

  // Critical: Hold under 15s to catch cap mutant
  const planned5: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 5,
    target_reps_max: 5,
    rest_seconds: 60,
  };

  const result5 = resolveSessionTargets(planned5, {
    isDeload: true,
    loadReducible: false,
    metric: "seconds",
  });

  // 5 * 2/3 = 3.33 → 5 (nearest 5), min 10 → 10, capped at planned 5 → 5
  check(
    "Hold trim: 5s stays 5s (cap mutant killer)",
    result5.repsMin === 5 && result5.repsMax === 5,
    `got ${result5.repsMin}s, expected 5s not 10s`
  );

  // Range case: 5-12s
  const planned5_12: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 5,
    target_reps_max: 12,
    rest_seconds: 60,
  };

  const result5_12 = resolveSessionTargets(planned5_12, {
    isDeload: true,
    loadReducible: false,
    metric: "seconds",
  });

  // 5 * 2/3 = 3.33 → 5 (nearest 5), min 10 → 10, capped at planned 5 → 5
  // 12 * 2/3 = 8 → 10 (nearest 5), min 10 → 10
  check(
    "Hold trim: 5-12s → 5-10s (cap applied to min)",
    result5_12.repsMin === 5 && result5_12.repsMax === 10,
    `got ${result5_12.repsMin}-${result5_12.repsMax}s`
  );
}

console.log("\n12. Edge case: min > max after trim is corrected");
{
  // Artificial case where max would round lower than min
  const planned: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 5,
    target_reps_max: 5,
    rest_seconds: 60,
  };

  const result = resolveSessionTargets(planned, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 5 * 2/3 = 3.33 → 3
  check(
    "Edge: min ≤ max always holds",
    result.repsMin <= result.repsMax,
    `${result.repsMin} > ${result.repsMax}`
  );
  check(
    "Edge: 5 → 3",
    result.repsMin === 3 && result.repsMax === 3,
    `got ${result.repsMin}-${result.repsMax}`
  );

  // Critical case to catch min>max edge case: edge rounding with range
  // This targets the Math.max(trimmedMinBeforeCap, trimmedMaxBeforeCap) logic
  const planned11_13: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 11,
    target_reps_max: 13,
    rest_seconds: 60,
  };

  const result11_13 = resolveSessionTargets(planned11_13, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 11 * 2/3 = 7.33 → 7, 13 * 2/3 = 8.67 → 9
  // The Math.max ensures max is at least as large as min after all operations
  check(
    "Edge: min ≤ max for 11-13 range",
    result11_13.repsMin <= result11_13.repsMax,
    `${result11_13.repsMin} > ${result11_13.repsMax}`
  );
}

console.log("\n13. Metric undefined: trim is skipped (footgun prevention)");
{
  // Without metric, a 40s hold would be trimmed as reps (40 * 2/3 = 27)
  const plannedHold: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 40,
    target_reps_max: 40,
    rest_seconds: 60,
  };

  const resultNoMetric = resolveSessionTargets(plannedHold, {
    isDeload: true,
    loadReducible: false,
    // metric omitted
  });

  check(
    "Metric undefined: hold not trimmed as reps",
    resultNoMetric.repsMin === 40 && resultNoMetric.repsMax === 40,
    `got ${resultNoMetric.repsMin}-${resultNoMetric.repsMax}, expected 40-40 (not 27-27)`
  );

  // Same test with reps
  const plannedReps: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 60,
  };

  const resultRepsNoMetric = resolveSessionTargets(plannedReps, {
    isDeload: true,
    loadReducible: false,
    // metric omitted
  });

  check(
    "Metric undefined: reps not trimmed",
    resultRepsNoMetric.repsMin === 8 && resultRepsNoMetric.repsMax === 12,
    `got ${resultRepsNoMetric.repsMin}-${resultRepsNoMetric.repsMax}`
  );
}

console.log("\n14. Trimmed values never exceed planned (cap verification)");
{
  // For holds, the cap is critical with small planned values
  // Already tested in section 11: 5s stays 5s, 5-12s becomes 5-10s
  
  // For reps, verify cap prevents exceeding planned after floor applied
  // The 0-1 case already tests this: 0 becomes 1 (floor), capped at max(1, planned)
  const plannedRepCap: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 0,
    target_reps_max: 0,
    rest_seconds: 60,
  };

  const resultRepCap = resolveSessionTargets(plannedRepCap, {
    isDeload: true,
    loadReducible: false,
    metric: "reps",
  });

  // 0 * 2/3 = 0 → floor to 1, then cap at max(1, 0) = 1
  check(
    "Rep cap: 0-0 becomes 1-1 (floor + defensive cap)",
    resultRepCap.repsMin === 1 && resultRepCap.repsMax === 1,
    `got ${resultRepCap.repsMin}-${resultRepCap.repsMax}`
  );

  // Verify the 5s hold cap more explicitly
  const plannedHoldCap: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 5,
    target_reps_max: 5,
    rest_seconds: 60,
  };

  const resultHoldCap = resolveSessionTargets(plannedHoldCap, {
    isDeload: true,
    loadReducible: false,
    metric: "seconds",
  });

  check(
    "Hold cap: 5s capped correctly",
    resultHoldCap.repsMin === 5 && resultHoldCap.repsMax === 5,
    `got ${resultHoldCap.repsMin}s`
  );
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
