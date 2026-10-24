/**
 * Tests effectiveRepsMax helper for timer and success check.
 *
 *   npx tsx scripts/test-effective-reps-max.ts
 */
import { effectiveRepsMax } from "../src/lib/program/effective-target";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\neffectiveRepsMax: timer and success check target");

// Loaded exercises: always use planned, never progressed.
check("loaded lift uses planned target",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: false, usedWeight: 60 }) === 12,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: false, usedWeight: 60 })}`);
check("loaded lift with null progressed uses planned",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: null, isBodyweight: false, usedWeight: 60 }) === 12,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: null, isBodyweight: false, usedWeight: 60 })}`);

// Bodyweight with added weight: treated as loaded, use planned.
check("bodyweight with added weight uses planned target",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: 10 }) === 12,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: 10 })}`);

// Unloaded bodyweight: use progressed if available, otherwise planned.
check("unloaded bodyweight with progressed 14 uses 14",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: null }) === 14,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: null })}`);
check("unloaded bodyweight with progressed 14 uses 14 (0 weight)",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: 0 }) === 14,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: 14, isBodyweight: true, usedWeight: 0 })}`);
check("unloaded bodyweight with null progressed uses planned 12",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: null, isBodyweight: true, usedWeight: null }) === 12,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: null, isBodyweight: true, usedWeight: null })}`);
check("unloaded bodyweight with undefined progressed uses planned 12",
  effectiveRepsMax({ plannedMax: 12, progressedTarget: undefined, isBodyweight: true, usedWeight: null }) === 12,
  `${effectiveRepsMax({ plannedMax: 12, progressedTarget: undefined, isBodyweight: true, usedWeight: null })}`);

// Hold (metric: seconds): same logic, different numbers.
check("hold with progressed 50s uses 50",
  effectiveRepsMax({ plannedMax: 45, progressedTarget: 50, isBodyweight: true, usedWeight: null }) === 50,
  `${effectiveRepsMax({ plannedMax: 45, progressedTarget: 50, isBodyweight: true, usedWeight: null })}`);
check("weighted hold uses planned 45s",
  effectiveRepsMax({ plannedMax: 45, progressedTarget: 50, isBodyweight: true, usedWeight: 20 }) === 45,
  `${effectiveRepsMax({ plannedMax: 45, progressedTarget: 50, isBodyweight: true, usedWeight: 20 })}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
