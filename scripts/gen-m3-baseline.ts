#!/usr/bin/env npx tsx
/**
 * Writes scripts/fixtures/m3-baseline-no-injury.json from origin/main's catalogue
 * fixture, through the shared real path (scripts/m3-real-path.ts).
 * Refuses to run if src/lib/program or the swap action differs from origin/main,
 * so "current code" here is main's generator. Deterministic: no timestamps.
 * Run: npx tsx scripts/gen-m3-baseline.ts
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { M3_NO_INJURY_PROFILES, parseCatalogue, snapshotPlan } from "./m3-real-path";

try {
  execSync("git diff --quiet origin/main HEAD -- src/lib/program src/app/session/actions.ts", { stdio: "pipe" });
} catch {
  console.error("src/lib/program or src/app/session/actions.ts differs from origin/main; generate the baseline on main instead");
  process.exit(1);
}
const mainCommit = execSync("git rev-parse origin/main", { encoding: "utf-8" }).trim();
const mainCatalogue = parseCatalogue(JSON.parse(execSync("git show origin/main:scripts/fixtures/catalogue.json", { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })));
const profiles = M3_NO_INJURY_PROFILES.map((p) => ({ userId: p.userId, days: snapshotPlan(p, mainCatalogue) }));
writeFileSync(join(process.cwd(), "scripts/fixtures/m3-baseline-no-injury.json"), JSON.stringify({ mainCommit, profiles }, null, 2) + "\n");
console.log(`baseline: ${profiles.length} profiles from ${mainCommit.slice(0, 8)}, ${mainCatalogue.length} exercises`);
