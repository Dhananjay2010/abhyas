/**
<<<<<<< HEAD
 * Test that the AGAIN card copy no longer says "starts right away"
 * (which was misleading for new tabs where audio requires a user gesture).
=======
 * Test that the AGAIN card copy says "starts right away"
 * (since tapping AGAIN in the same tab unlocks audio and starts immediately).
>>>>>>> origin/main
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

<<<<<<< HEAD
function checkFileForOldCopy(filePath: string, fileName: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const problemLines: number[] = [];
=======
function checkFileForCorrectCopy(filePath: string, fileName: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const foundLines: number[] = [];
>>>>>>> origin/main

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/starts right away/i.test(line)) {
<<<<<<< HEAD
        problemLines.push(i + 1);
      }
    }

    if (problemLines.length > 0) {
      console.error(`❌ ${fileName} still contains "starts right away":`);
      for (const lineNum of problemLines) {
        console.error(`   Line ${lineNum}: ${lines[lineNum - 1].trim()}`);
      }
      failures++;
    } else {
      console.log(`✓ ${fileName} does not contain "starts right away"`);
=======
        foundLines.push(i + 1);
      }
    }

    if (foundLines.length === 0) {
      console.error(`❌ ${fileName} does not contain "starts right away"`);
      failures++;
    } else {
      console.log(`✓ ${fileName} contains "starts right away"`);
      for (const lineNum of foundLines) {
        console.log(`   Line ${lineNum}: ${lines[lineNum - 1].trim()}`);
      }
>>>>>>> origin/main
    }
  } catch (error) {
    console.error(`❌ Could not read ${fileName}: ${error}`);
    failures++;
  }
}

<<<<<<< HEAD
console.log('Checking that "starts right away" copy has been replaced...\n');

// Check the file that contained the old copy
checkFileForOldCopy(
=======
console.log('Checking that "starts right away" copy is present...\n');

// Check the file that should contain the new copy
checkFileForCorrectCopy(
>>>>>>> origin/main
  join(process.cwd(), "src/app/breathe/breathe-home.tsx"),
  "src/app/breathe/breathe-home.tsx"
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
