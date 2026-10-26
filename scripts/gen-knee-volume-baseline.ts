#!/usr/bin/env npx tsx
/**
 * Generate knee-volume baseline from origin/main's code and catalogue.
 * Loads generateProgram from /tmp/main worktree.
 * Writes scripts/fixtures/knee-volume-baseline.json with SHA-256 hashes.
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import type { CandidateExercise } from "../src/lib/program/generate";
import { ALL_PROFILES, makeGeneratorInput } from "./knee-volume-grid";

// Import generateProgram from /tmp/main worktree
function loadMainGenerate(mainPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateProgram } = require(join(mainPath, "src/lib/program/generate"));
  return generateProgram;
}

const mainPath = process.argv[2] || "/tmp/main";
const generateProgram = loadMainGenerate(mainPath);

const mainCommit = execSync("git -C " + mainPath + " rev-parse HEAD", { encoding: "utf-8" }).trim();
console.log(`Generating baseline from main ${mainCommit.slice(0, 8)}...`);

// Load catalogue from mainPath
const catalogue = JSON.parse(
  readFileSync(join(mainPath, "scripts/fixtures/catalogue.json"), "utf-8")
) as CandidateExercise[];

const profiles = ALL_PROFILES.map((spec) => {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  const json = JSON.stringify(result);
  const sha256 = createHash("sha256").update(json).digest("hex");
  return { id: spec.id, sha256 };
});

const baseline = {
  mainCommit,
  profiles,
};

const outPath = join(process.cwd(), "scripts/fixtures/knee-volume-baseline.json");
writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");

console.log(`Wrote ${profiles.length} profile hashes to ${outPath}`);
console.log(`mainCommit: ${mainCommit}`);
