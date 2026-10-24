import { activeTab } from "../src/lib/nav";

let failures = 0;

function test(pathname: string, expected: string | null, description: string) {
  const actual = activeTab(pathname);
  if (actual !== expected) {
    console.error(`❌ ${description}`);
    console.error(`   pathname: ${pathname}`);
    console.error(`   expected: ${expected}`);
    console.error(`   actual:   ${actual}`);
    failures++;
  } else {
    console.log(`✓ ${description}`);
  }
}

console.log("Testing activeTab()...\n");

// Today
test("/", null, "Root path shows no nav");
test("/today", "/today", "Today tab on /today");

// Yoga (now part of Practice tab)
test("/yoga", "/practice", "Practice tab on /yoga");
test("/yoga/some-slug", "/practice", "Practice tab on /yoga/<slug>");

// Breathe (part of Practice tab)
test("/breathe", "/practice", "Practice tab on /breathe");
test("/breathe/some-slug", "/practice", "Practice tab on /breathe/<slug>");
test("/breathe/routine/some-slug", "/practice", "Practice tab on /breathe/routine/<slug>");
test("/breathe/journey/some-slug", "/practice", "Practice tab on /breathe/journey/<slug>");
test("/breathe/some-slug/session", null, "No nav on /breathe/<slug>/session (full-screen)");
test("/breathe/routine/some-slug/session", null, "No nav on /breathe/routine/<slug>/session");
test("/breathe/journey/some-slug/session", null, "No nav on /breathe/journey/<slug>/session");

// History
test("/history", "/history", "History tab on /history");
test("/history/123", "/history", "History tab on /history/<id>");

// Progress
test("/progress", "/progress", "Progress tab on /progress");

// Settings
test("/settings", "/settings", "Settings tab on /settings");

// Dev harnesses
test("/dev/history", "/history", "History tab on /dev/history");
test("/dev/settings", "/settings", "Settings tab on /dev/settings");
test("/dev/charts", "/progress", "Progress tab on /dev/charts");
test("/dev/breathe", "/practice", "Practice tab on /dev/breathe");
test("/dev/breathe/some-slug", "/practice", "Practice tab on /dev/breathe/<slug>");
test("/dev/yoga", "/today", "Today tab on /dev/yoga");
test("/dev/loading-states", "/today", "Today tab on /dev/loading-states");

// Full-screen routes with no nav
test("/session/123", null, "No nav on /session/<id>");
test("/onboarding", null, "No nav on /onboarding");
test("/privacy", null, "No nav on /privacy");
test("/terms", null, "No nav on /terms");
test("/offline", null, "No nav on /offline");

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
