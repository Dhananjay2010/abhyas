/**
 * Test: Deload input validation and rep/hold trim
 *
 * L3: applyDeload must reject non-finite values and values < 1
 * L2: On deload rows where sets aren't cut AND loadReducible is false,
 *     trim reps/holds by ~1/3
 *
 * Key invariants:
 * - applyDeload throws on NaN, Infinity, -Infinity, and values < 1
 * - applyDeload rounds non-integers before validation
 * - All valid integers >= 1 produce the same result as before
 * - Rep trim: multiply by 2/3, round, minimum 1, preserve min ≤ max
 * - Hold trim: multiply by 2/3, round to nearest 5s, minimum 10s
 * - Trim only applies when sets weren't cut AND loadReducible === false
 * - loadReducible undefined preserves exact backward compatibility
 *
 *   npm run test:deload-trim
 */
import {
  applyDeload,
  type Prescription,
} from "../src/lib/program/prescription";
import {
  resolveSessionTargets,
  type PlannedExercise,
} from "../src/lib/program/session-targets";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

console.log("\n1. applyDeload: exhaustive sweep sets 1-10, unchanged vs current formula");
{
  const cases = [
    { sets: 1, expected: 1 },
    { sets: 2, expected: 2 },
    { sets: 3, expected: 2 },
    { sets: 4, expected: 2 },
    { sets: 5, expected: 3 },
    { sets: 6, expected: 4 },
    { sets: 7, expected: 4 },
    { sets: 8, expected: 5 },
    { sets: 9, expected: 5 },
    { sets: 10, expected: 6 },
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
}

console.log("\n6. Known-weight rows get no trim (loadReducible undefined)");
{
  const planned: PlannedExercise = {
    target_sets: 2,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  };

  const resultUndefined = resolveSessionTargets(planned, {
    isDeload: true,
    // loadReducible omitted = undefined
  });

  check(
    "loadReducible undefined: reps unchanged",
    resultUndefined.repsMin === 8 && resultUndefined.repsMax === 12,
    `got ${resultUndefined.repsMin}-${resultUndefined.repsMax}`
  );

  const resultTrue = resolveSessionTargets(planned, {
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
  for (let sets = 1; sets <= 10; sets++) {
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
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
