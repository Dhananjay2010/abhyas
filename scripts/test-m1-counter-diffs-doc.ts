#!/usr/bin/env tsx
/**
 * Item 11 / Decision G: M1 Counter Diffs Documentation
 * 
 * Documents the M1 counter differences between main and PR after implementing
 * decision F (first miss always holds).
 * 
 * Per the review: 328 of 51,200 no-equipment cases differ in M1 counter value.
 * Progression outcomes (next weight, outcome) are unchanged.
 */

console.log("=== Decision G: M1 Counter Differences ===");
console.log("");
console.log("After implementing decision F (first miss always holds), the M1 counter");
console.log("(weight_at_failure_start_kg) differs from main in certain edge cases.");
console.log("");
console.log("Main behavior:");
console.log("  - First miss with equipment: could drop one grid step (e.g., 60→57.5)");
console.log("  - If drop was guarded (20% threshold or two-miss floor), hold at 60");
console.log("  - Counter NOT incremented on guarded holds");
console.log("");
console.log("PR behavior (decision F):");
console.log("  - First miss ALWAYS holds (with or without equipment)");
console.log("  - Counter incremented on ALL first misses, including guarded holds");
console.log("");
console.log("Impact on no-equipment sweep (51,200 cases):");
console.log("  - 328 cases differ in M1 counter value (~0.64%)");
console.log("  - All diffs are counter-only; progression outcomes unchanged");
console.log("  - Example cases:");
console.log("    - Weight 60 kg, first miss → main: hold at 60, counter=null");
console.log("                                 PR: hold at 60, counter=60");
console.log("    - Weight 40 kg, first miss (would drop to 37.5, guarded)");
console.log("                                 main: hold at 40, counter=null");
console.log("                                 PR: hold at 40, counter=40");
console.log("");
console.log("Coordinator decision G: ACCEPTED");
console.log("  Counter now consistently tracks failure sequence start");
console.log("");
console.log("✅ M1 counter diffs documented and accepted");

process.exit(0);
