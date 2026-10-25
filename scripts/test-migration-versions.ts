/**
 * Test that no two migration files share the same version prefix.
 * 
 * Migration files are named YYYYMMDDHHMMSS_description.sql where the timestamp
 * prefix is the version. If two files have the same version, only one will be
 * applied (non-deterministically), causing schema drift between environments.
 * 
 * This test runs in CI and fails the build if duplicates are found.
 */

import { readdirSync, readFileSync } from "fs";
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

// Verify that trigger functions revoked in 20261024100000_harden_account_deletion.sql
// actually exist in earlier migrations, so the revoke won't fail on a fresh database
console.log("\nTrigger function existence check");
console.log("================================\n");

try {
  const hardeningFile = resolve(MIGRATIONS_DIR, "20261024100000_harden_account_deletion.sql");
  const hardeningContent = readFileSync(hardeningFile, "utf-8");
  
  // Extract function names being revoked
  const revokeMatches = hardeningContent.matchAll(/revoke execute on function public\.(\w+)\(\)/g);
  const revokedFunctions = Array.from(revokeMatches, m => m[1]);
  
  if (revokedFunctions.length === 0) {
    check("Found trigger functions to check", false, "no revoke statements found");
  } else {
    console.log(`Checking ${revokedFunctions.length} revoked function(s): ${revokedFunctions.join(", ")}\n`);
    
    // Check each function exists in migrations before 20261024100000
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && f < "20261024100000_harden_account_deletion.sql")
      .sort();
    
    for (const fnName of revokedFunctions) {
      let found = false;
      for (const file of files) {
        const content = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
        // Look for function creation
        if (content.match(new RegExp(`create (or replace )?function public/.${fnName}/(`))) {
          found = true;
          check(`${fnName}() exists`, true, `defined in ${file}`);
          break;
        }
      }
      if (!found) {
        check(`${fnName}() exists before revoke`, false, "function not found in earlier migrations");
      }
    }
  }
} catch (err) {
  check("Check trigger function existence", false, (err as Error).message);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
