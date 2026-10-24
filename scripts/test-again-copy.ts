/**
 * Test that the AGAIN card copy says "starts right away"
 * (since tapping AGAIN in the same tab unlocks audio and starts immediately).
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function checkFileForCorrectCopy(filePath: string, fileName: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const foundLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/starts right away/i.test(line)) {
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
    }
  } catch (error) {
    console.error(`❌ Could not read ${fileName}: ${error}`);
    failures++;
  }
}

console.log('Checking that "starts right away" copy is present...\n');

// Check the file that should contain the new copy
checkFileForCorrectCopy(
  join(process.cwd(), "src/app/breathe/breathe-home.tsx"),
  "src/app/breathe/breathe-home.tsx"
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
