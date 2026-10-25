/**
 * Item A gate: the swap list the member is offered and the swap the server
 * accepts must be the same set — exhaustively, over every catalogue exercise
 * as the current exercise × 8 account profiles.
 *
 * UI side:     the REAL findAlternatives server action (its own fetches).
 * Server side: the REAL swapExerciseForUser (its own fetches + validator).
 *
 * Both run against one in-memory PostgREST (scripts/helpers/fake-swap-db.ts)
 * that projects every response to the selected columns, so a column dropped
 * from either side's select (e.g. `metric` on the server's current-exercise
 * fetch) changes what that side computes and shows up here as a mismatch.
 *
 * For each (profile, current exercise):
 *   - every offered id must be accepted and written by the server, and
 *   - up to two same-pattern catalogue exercises that were NOT offered must be
 *     refused with nothing written.
 * 
 * Subset proof (current-knee profiles only):
 *   - Load main e559b89e's captured findAlternatives output.
 *   - For every current-knee profile × exercise, assert that HEAD's offered
 *     set is a SUBSET of main's (never adds a move main doesn't offer).
 *   - Report lists that are strictly smaller (removals).
 */
import { readFileSync } from "node:fs";
import { installServerActionStubs } from "./helpers/server-action-stubs";
import {
  buildDb, activateDb, writes, CATALOGUE, SLOT_ID, USER_ID, byId,
  type Account,
} from "./helpers/swap-scenario";
import { swapExerciseForUser } from "../src/lib/session/swap-exercise-for-user";

const PROFILES: Array<{ name: string; account: Account }> = [
  { name: "Healthy beginner, gym", account: { level: "beginner", equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar"], injuries: [] } },
  { name: "Current knee, intermediate, home", account: { level: "intermediate", equipment: ["dumbbell", "adjustable_bench", "pull_up_bar"], injuries: [{ body_region: "knee", severity: "current" }] } },
  { name: "Past knee, expert, gym", account: { level: "expert", equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine"], injuries: [{ body_region: "knee", severity: "past" }] } },
  { name: "Current shoulder, beginner, bodyweight", account: { level: "beginner", equipment: [], injuries: [{ body_region: "shoulder", severity: "current" }] } },
  { name: "Past lower_back, intermediate, DB-only", account: { level: "intermediate", equipment: ["dumbbell", "adjustable_bench"], injuries: [{ body_region: "lower_back", severity: "past" }] } },
  { name: "Current wrist, expert, gym", account: { level: "expert", equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine"], injuries: [{ body_region: "wrist", severity: "current" }] } },
  { name: "Past knee + current shoulder, intermediate", account: { level: "intermediate", equipment: ["dumbbell", "kettlebell", "pull_up_bar"], injuries: [{ body_region: "knee", severity: "past" }, { body_region: "shoulder", severity: "current" }] } },
  { name: "Healthy expert, kettlebell-only", account: { level: "expert", equipment: ["kettlebell"], injuries: [] } },
];

async function main() {
  installServerActionStubs();
  const { findAlternatives } = await import("../src/app/session/actions");

  // Load main's captured output for subset proof
  const mainFixture = JSON.parse(readFileSync("scripts/fixtures/main-current-knee-swaps.json", "utf8"));
  const mainSwaps: Record<string, Record<string, string[]>> = mainFixture.profiles;
  const currentKneeProfiles = new Set(Object.keys(mainSwaps));

  const currents = CATALOGUE.filter((e) => e.movement_pattern);
  let combos = 0;
  let offeredChecks = 0;
  let refusedChecks = 0;
  const offeredButRefused: string[] = [];
  const acceptedNotOffered: string[] = [];
  
  // Subset proof tracking
  let subsetChecks = 0;
  let strictlySmaller = 0;
  const removals: Array<{ profile: string; exercise: string; removed: string[] }> = [];

  console.log("Item A gate: real findAlternatives vs real swapExerciseForUser");
  console.log("─".repeat(70));

  for (const { name, account } of PROFILES) {
    let profileMismatches = 0;
    for (const current of currents) {
      // One sibling already in the session: the first other exercise of the same pattern.
      const sibling = currents.find((e) => e.id !== current.id && e.movement_pattern === current.movement_pattern);
      const db = buildDb({ account, current, exercises: CATALOGUE, siblings: sibling ? [sibling] : [] });
      activateDb(db);
      const slot = db.tables.session_exercises.find((r) => r.id === SLOT_ID);
      if (!slot) throw new Error("slot row missing");
      const reset = () => {
        slot.exercise_id = current.id;
        db.requests.length = 0;
      };

      const res = await findAlternatives(SLOT_ID);
      combos++;
      if (!res.ok) continue;
      const offered = new Set(res.data.map((a) => a.exerciseId));

      // Subset proof for current-knee profiles
      if (currentKneeProfiles.has(name) && mainSwaps[name]?.[current.slug]) {
        subsetChecks++;
        const mainSet = new Set(mainSwaps[name][current.slug]);
        const added = [...offered].filter((id) => !mainSet.has(id));
        const removed = [...mainSet].filter((id) => !offered.has(id));
        if (added.length > 0) {
          const addedSlugs = added.map((id) => byId.get(id)?.slug ?? id).join(", ");
          offeredButRefused.push(`SUBSET VIOLATION: ${name} | ${current.slug} added [${addedSlugs}] not in main`);
        }
        if (removed.length > 0) {
          strictlySmaller++;
          removals.push({ profile: name, exercise: current.slug, removed });
        }
      }

      for (const id of offered) {
        reset();
        const r = await swapExerciseForUser(db.client, USER_ID, { sessionExerciseId: SLOT_ID, newExerciseId: id });
        offeredChecks++;
        if (!r.ok || writes(db).length === 0) {
          profileMismatches++;
          offeredButRefused.push(`${name} | ${current.slug} → ${CATALOGUE.find((e) => e.id === id)?.slug ?? id}`);
        }
      }

      const probes = currents
        .filter((e) => e.movement_pattern === current.movement_pattern && e.id !== current.id && !offered.has(e.id))
        .slice(0, 2);
      for (const probe of probes) {
        reset();
        const r = await swapExerciseForUser(db.client, USER_ID, { sessionExerciseId: SLOT_ID, newExerciseId: probe.id });
        refusedChecks++;
        if (r.ok || writes(db).length > 0) {
          profileMismatches++;
          acceptedNotOffered.push(`${name} | ${current.slug} → ${probe.slug}`);
        }
      }
    }
    console.log(`  ${profileMismatches === 0 ? "✓" : "✗"} ${name}: ${profileMismatches} mismatches`);
  }

  console.log("─".repeat(70));
  console.log(`Combinations (profile × current): ${combos} (${PROFILES.length} × ${currents.length})`);
  console.log(`Offered ids checked against the server: ${offeredChecks}`);
  console.log(`Not-offered ids probed: ${refusedChecks}`);
  console.log(`Offered-but-refused: ${offeredButRefused.length}`);
  console.log(`Accepted-not-offered: ${acceptedNotOffered.length}`);
  for (const line of [...offeredButRefused, ...acceptedNotOffered].slice(0, 10)) console.log(`    ${line}`);

  console.log("\nSubset proof (current-knee profiles vs main e559b89e):");
  console.log(`  Subset checks: ${subsetChecks}`);
  console.log(`  Lists strictly smaller: ${strictlySmaller}`);
  console.log(`  Removals (top 20):`);
  for (const { profile, exercise, removed } of removals.slice(0, 20)) {
    const slugs = removed.map((id) => byId.get(id)?.slug ?? id).join(", ");
    console.log(`    ${profile} | ${exercise}: [${slugs}]`);
  }
  if (removals.length > 20) console.log(`    ... and ${removals.length - 20} more`);

  const vacuous = combos !== PROFILES.length * currents.length || offeredChecks < 5000 || refusedChecks < 2000;
  if (vacuous) console.log("✗ coverage too small — the gate would be vacuous");
  const ok = !vacuous && offeredButRefused.length === 0 && acceptedNotOffered.length === 0;
  console.log(ok ? "✓ PASSED" : "✗ FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
