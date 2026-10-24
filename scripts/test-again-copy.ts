/**
 * Test that the AGAIN card copy no longer says "starts right away"
 * (which was misleading for new tabs where audio requires a user gesture).
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function checkFileForOldCopy(filePath: string, fileName: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const problemLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/starts right away/i.test(line)) {
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
    }
  } catch (error) {
    console.error(`❌ Could not read ${fileName}: ${error}`);
    failures++;
  }
}

console.log('Checking that "starts right away" copy has been replaced...\n');

// Check the file that contained the old copy
checkFileForOldCopy(
  join(process.cwd(), "src/app/breathe/breathe-home.tsx"),
  "src/app/breathe/breathe-home.tsx"
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
