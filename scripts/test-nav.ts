import { activeTab, setLastPractice, PRACTICE_LAST_CHANGE_EVENT } from "../src/lib/nav";

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
test("/dev/yoga", "/practice", "Practice tab on /dev/yoga");
test("/dev/loading-states", "/today", "Today tab on /dev/loading-states");

// Ensure full-screen session pages show no nav
test("/breathe/physiological-sigh/session", null, "No nav on /breathe/<slug>/session");

// Full-screen routes with no nav
test("/session/123", null, "No nav on /session/<id>");
test("/onboarding", null, "No nav on /onboarding");
test("/privacy", null, "No nav on /privacy");
test("/terms", null, "No nav on /terms");
test("/offline", null, "No nav on /offline");

console.log("\n\nTesting setLastPractice() helper...\n");

// Test that setLastPractice dispatches the custom event
function testSetLastPractice() {
  // Create a minimal fake window with localStorage and event dispatch
  const fakeStorage = new Map<string, string>();
  const eventListeners = new Map<string, Array<() => void>>();
  
  const fakeWindow = {
    localStorage: {
      setItem(key: string, value: string) {
        fakeStorage.set(key, value);
      },
      getItem(key: string) {
        return fakeStorage.get(key) || null;
      },
    },
    dispatchEvent(event: Event) {
      const listeners = eventListeners.get(event.type) || [];
      listeners.forEach(fn => fn());
      return true;
    },
    addEventListener(type: string, fn: () => void) {
      if (!eventListeners.has(type)) {
        eventListeners.set(type, []);
      }
      eventListeners.get(type)!.push(fn);
    },
  };
  
  // Temporarily replace global window for testing
  const originalWindow = global.window;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).window = fakeWindow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).localStorage = fakeWindow.localStorage;
  
  try {
    let eventFired = false;
    fakeWindow.addEventListener(PRACTICE_LAST_CHANGE_EVENT, () => {
      eventFired = true;
    });
    
    // Call setLastPractice
    setLastPractice("yoga");
    
    // Verify localStorage was written
    if (fakeStorage.get("practice:last") !== "yoga") {
      console.error("❌ setLastPractice should write to localStorage");
      failures++;
    } else {
      console.log("✓ setLastPractice writes to localStorage");
    }
    
    // Verify event was dispatched
    if (!eventFired) {
      console.error("❌ setLastPractice should dispatch practice:last-change event");
      failures++;
    } else {
      console.log("✓ setLastPractice dispatches practice:last-change event");
    }
    
    // Test with breathe
    eventFired = false;
    setLastPractice("breathe");
    
    if (fakeStorage.get("practice:last") !== "breathe") {
      console.error("❌ setLastPractice should update localStorage value");
      failures++;
    } else {
      console.log("✓ setLastPractice updates localStorage value");
    }
    
    if (!eventFired) {
      console.error("❌ setLastPractice should dispatch event on each call");
      failures++;
    } else {
      console.log("✓ setLastPractice dispatches event on each call");
    }
  } finally {
    // Restore original window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).window = originalWindow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).localStorage = originalWindow?.localStorage;
  }
}

testSetLastPractice();

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
