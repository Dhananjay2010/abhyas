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
  effectiveRepsMax(12, 14, 60) === 12, `${effectiveRepsMax(12, 14, 60)}`);
check("loaded lift with null progressed uses planned",
  effectiveRepsMax(12, null, 60) === 12, `${effectiveRepsMax(12, null, 60)}`);

// Bodyweight with added weight: treated as loaded, use planned.
check("bodyweight with added weight uses planned target",
  effectiveRepsMax(12, 14, 10) === 12, `${effectiveRepsMax(12, 14, 10)}`);

// Unloaded bodyweight: use progressed if available, otherwise planned.
check("unloaded bodyweight with progressed 14 uses 14",
  effectiveRepsMax(12, 14, null) === 14, `${effectiveRepsMax(12, 14, null)}`);
check("unloaded bodyweight with progressed 14 uses 14 (0 weight)",
  effectiveRepsMax(12, 14, 0) === 14, `${effectiveRepsMax(12, 14, 0)}`);
check("unloaded bodyweight with null progressed uses planned 12",
  effectiveRepsMax(12, null, null) === 12, `${effectiveRepsMax(12, null, null)}`);
check("unloaded bodyweight with undefined progressed uses planned 12",
  effectiveRepsMax(12, undefined, null) === 12, `${effectiveRepsMax(12, undefined, null)}`);

// Hold (metric: seconds): same logic, different numbers.
check("hold with progressed 50s uses 50",
  effectiveRepsMax(45, 50, null) === 50, `${effectiveRepsMax(45, 50, null)}`);
check("weighted hold uses planned 45s",
  effectiveRepsMax(45, 50, 20) === 45, `${effectiveRepsMax(45, 50, 20)}`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
