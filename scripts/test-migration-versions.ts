/**
 * Test that no two migration files share the same version prefix.
 * 
 * Migration files are named YYYYMMDDHHMMSS_description.sql where the timestamp
 * prefix is the version. If two files have the same version, only one will be
 * applied (non-deterministically), causing schema drift between environments.
 * 
 * This test runs in CI and fails the build if duplicates are found.
 */

import { readdirSync } from "fs";
import { resolve } from "path";

export {}; // Make this a module to avoid global scope conflicts

const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nMigration version uniqueness check");
console.log("===================================\n");

try {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  // Extract version prefixes (digits before first underscore)
  const versions = new Map<string, string[]>();
  
  for (const file of files) {
    const match = file.match(/^(\d+)_/);
    if (!match) {
      check(`${file} has valid version format`, false, "no version prefix found");
      continue;
    }
    
    const version = match[1];
    if (!versions.has(version)) {
      versions.set(version, []);
    }
    versions.get(version)!.push(file);
  }

  // Check for duplicates
  let duplicatesFound = false;
  for (const [version, fileList] of versions) {
    if (fileList.length > 1) {
      duplicatesFound = true;
      check(`Version ${version} is unique`, false, `used by: ${fileList.join(", ")}`);
    }
  }

  if (!duplicatesFound) {
    check("All migration versions are unique", true);
    console.log("\nVersion range:");
    const sortedVersions = Array.from(versions.keys()).sort();
    console.log(`  First: ${sortedVersions[0]}`);
    console.log(`  Last:  ${sortedVersions[sortedVersions.length - 1]}`);
  }

} catch (err) {
  check("Read migrations directory", false, (err as Error).message);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
