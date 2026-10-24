export {};
import { choosePracticeRoute, type PracticeType } from "../src/lib/nav";

let failures = 0;

function test(
  currentPath: string,
  lastPractice: PracticeType | null,
  expected: "/breathe" | "/yoga",
  description: string
) {
  const actual = choosePracticeRoute(currentPath, lastPractice);
  if (actual !== expected) {
    console.error(`❌ ${description}`);
    console.error(`   currentPath:  ${currentPath}`);
    console.error(`   lastPractice: ${lastPractice}`);
    console.error(`   expected:     ${expected}`);
    console.error(`   actual:       ${actual}`);
    failures++;
  } else {
    console.log(`✓ ${description}`);
  }
}

console.log("Testing choosePracticeRoute()...\n");

// When on yoga, stay in yoga
test("/yoga", null, "/yoga", "On /yoga with no history → /yoga");
test("/yoga", "breathe", "/yoga", "On /yoga with breathe history → /yoga");
test("/yoga/some-video", null, "/yoga", "On /yoga/<slug> → /yoga");

// When on breathe, stay in breathe
test("/breathe", null, "/breathe", "On /breathe with no history → /breathe");
test("/breathe", "yoga", "/breathe", "On /breathe with yoga history → /breathe");
test("/breathe/box-breathing", null, "/breathe", "On /breathe/<slug> → /breathe");
test("/breathe/routine/downshift", null, "/breathe", "On /breathe/routine/<slug> → /breathe");
test("/breathe/journey/calm", null, "/breathe", "On /breathe/journey/<slug> → /breathe");

// When on other tabs, use last practice or default to breathe
test("/today", null, "/breathe", "On /today with no history → /breathe (default)");
test("/today", "breathe", "/breathe", "On /today with breathe history → /breathe");
test("/today", "yoga", "/yoga", "On /today with yoga history → /yoga");

test("/history", null, "/breathe", "On /history with no history → /breathe (default)");
test("/history", "yoga", "/yoga", "On /history with yoga history → /yoga");

test("/progress", null, "/breathe", "On /progress with no history → /breathe (default)");
test("/progress", "breathe", "/breathe", "On /progress with breathe history → /breathe");

test("/settings", null, "/breathe", "On /settings with no history → /breathe (default)");
test("/settings", "yoga", "/yoga", "On /settings with yoga history → /yoga");

// Session pages (full-screen, user navigates away from practice)
test(
  "/breathe/box-breathing/session",
  null,
  "/breathe",
  "On session page → /breathe (not a practice list page)"
);
test(
  "/breathe/box-breathing/session",
  "yoga",
  "/yoga",
  "On session page with yoga history → /yoga"
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
