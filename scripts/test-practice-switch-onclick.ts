/**
 * Test that PracticeSwitch calls setLastPractice() synchronously in onClick,
 * so the Practice tab opens the correct practice immediately without the
 * late-write delay from useEffect.
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function checkPracticeSwitchOnClick(): void {
  try {
    const filePath = join(process.cwd(), "src/components/practice-switch.tsx");
    const content = readFileSync(filePath, "utf-8");

    // Check that both /breathe and /yoga links have onClick handlers
    const breatheLinkMatch = content.match(
      /<Link\s+href="\/breathe"[\s\S]*?onClick=\{[\s\S]*?setLastPractice\("breathe"\)[\s\S]*?\}/
    );
    const yogaLinkMatch = content.match(
      /<Link\s+href="\/yoga"[\s\S]*?onClick=\{[\s\S]*?setLastPractice\("yoga"\)[\s\S]*?\}/
    );

    if (!breatheLinkMatch) {
      console.error('❌ /breathe link should have onClick={() => setLastPractice("breathe")}');
      failures++;
    } else {
      console.log('✓ /breathe link has onClick with setLastPractice("breathe")');
    }

    if (!yogaLinkMatch) {
      console.error('❌ /yoga link should have onClick={() => setLastPractice("yoga")}');
      failures++;
    } else {
      console.log('✓ /yoga link has onClick with setLastPractice("yoga")');
    }

    // Verify the useEffect fallback still exists for direct visits
    const hasUseEffect = content.includes("useEffect") && content.includes("setLastPractice");
    if (!hasUseEffect) {
      console.error("❌ useEffect fallback for direct visits should still exist");
      failures++;
    } else {
      console.log("✓ useEffect fallback for direct visits is preserved");
    }
  } catch (error) {
    console.error(`❌ Could not read practice-switch.tsx: ${error}`);
    failures++;
  }
}

console.log("Testing PracticeSwitch onClick behavior...\n");
checkPracticeSwitchOnClick();

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
