#!/usr/bin/env npx tsx
/**
 * Generate knee-volume baseline from origin/main's code and catalogue.
 * Refuses to run unless src/lib/program matches origin/main.
 * Writes scripts/fixtures/knee-volume-baseline.json with SHA-256 hashes.
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import type { CandidateExercise } from "../src/lib/program/generate";
import { ALL_PROFILES, makeGeneratorInput } from "./knee-volume-grid";

// Import generateProgram dynamically from main
function loadMainGenerate() {
  try {
    execSync("git diff --quiet origin/main HEAD -- src/lib/program", { stdio: "pipe" });
  } catch {
    console.error("src/lib/program differs from origin/main; generate the baseline on main instead");
    process.exit(1);
  }
  
  // We're on main or src/lib/program matches, so use the current module
  const { generateProgram } = require("../src/lib/program/generate");
  return generateProgram;
}

const generateProgram = loadMainGenerate();

const mainCommit = execSync("git rev-parse origin/main", { encoding: "utf-8" }).trim();
console.log(`Generating baseline from main ${mainCommit.slice(0, 8)}...`);

// Load catalogue from main
const catalogueJson = execSync("git show origin/main:scripts/fixtures/catalogue.json", { 
  encoding: "utf-8", 
  maxBuffer: 64 * 1024 * 1024 
});
const catalogue = JSON.parse(catalogueJson) as CandidateExercise[];

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
