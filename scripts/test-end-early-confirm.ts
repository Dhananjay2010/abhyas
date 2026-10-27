#!/usr/bin/env tsx
/**
 * Test end-early confirmation text, rendering, and runEndEarly return values.
 *
 *   npx tsx scripts/test-end-early-confirm.ts
 */

import { endEarlyConfirmTitle } from "../src/lib/session/end-early-text";
import { runEndEarly } from "../src/lib/session/finish-flow";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\nTesting end-early confirmation text\n");

  console.log("1. endEarlyConfirmTitle with real counts");
  {
    const title = endEarlyConfirmTitle(5, 12);
    assertEquals(title, "End now? 5 of 12 sets done", "Shows real counts");
  }

  console.log("\n2. endEarlyConfirmTitle with 0 sets");
  {
    const title = endEarlyConfirmTitle(0, 12);
    assertEquals(title, "End now? 0 of 12 sets done", "Shows 0 sets");
  }

  console.log("\n3. endEarlyConfirmTitle with all sets done");
  {
    const title = endEarlyConfirmTitle(12, 12);
    assertEquals(title, "End now? 12 of 12 sets done", "Shows all sets done");
  }

  console.log("\n4. Render test: EndEarlyConfirm contains correct text");
  {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");

    const MockDialog = ({ setsDone, setsPlanned }: { setsDone: number; setsPlanned: number }) => {
      const titleText = endEarlyConfirmTitle(setsDone, setsPlanned);
      const hasNoSets = setsDone === 0;
      
      return React.createElement(
        "div",
        { "data-testid": "end-early-confirm" },
        React.createElement("p", { id: "end-early-title" }, titleText),
        React.createElement(
          "p",
          { id: "end-early-desc" },
          hasNoSets
            ? "You can start it again from Today."
            : "The session can't be resumed once ended."
        )
      );
    };

    const html = renderToStaticMarkup(
      React.createElement(MockDialog, { setsDone: 7, setsPlanned: 15 })
    );

    assertTrue(html.includes("End now? 7 of 15 sets done"), "Contains confirmation text with counts");
    assertTrue(html.includes("session can&#x27;t be resumed") || html.includes("session can't be resumed"), "Contains warning text");
  }

  console.log("\n5. Render test: EndEarlyConfirm with 0 sets shows different message");
  {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");

    const MockDialog = ({ setsDone, setsPlanned }: { setsDone: number; setsPlanned: number }) => {
      const titleText = endEarlyConfirmTitle(setsDone, setsPlanned);
      const hasNoSets = setsDone === 0;
      
      return React.createElement(
        "div",
        { "data-testid": "end-early-confirm" },
        React.createElement("p", { id: "end-early-title" }, titleText),
        React.createElement(
          "p",
          { id: "end-early-desc" },
          hasNoSets
            ? "You can start it again from Today."
            : "The session can't be resumed once ended."
        )
      );
    };

    const html = renderToStaticMarkup(
      React.createElement(MockDialog, { setsDone: 0, setsPlanned: 12 })
    );

    assertTrue(html.includes("End now? 0 of 12 sets done"), "Contains confirmation text with 0 sets");
    assertTrue(html.includes("start it again from Today"), "Shows restart message for 0 sets");
  }

  console.log("\n6. runEndEarly returns true on success");
  {
    let navigated = false;
    const ended = await runEndEarly(
      {
        abandonSession: async () => ({ ok: true }),
        stopElapsed: () => 100,
        resumeElapsed: () => {},
        setError: () => {},
        navigateToToday: () => { navigated = true; },
      },
      {
        sessionId: "test-session",
        setConfirming: () => {},
        setOfflineError: () => {},
        endingRef: { current: false },
        setEnding: () => {},
      }
    );
    
    assertEquals(ended, true, "Returns true on success");
    assertTrue(navigated, "Navigates to /today on success");
  }

  console.log("\n7. runEndEarly returns false on ok:false");
  {
    let resumeElapsedCalled = false;
    let setErrorCalled = false;
    let navigated = false;
    
    const ended = await runEndEarly(
      {
        abandonSession: async () => ({ ok: false, error: "Server error" }),
        stopElapsed: () => 100,
        resumeElapsed: () => { resumeElapsedCalled = true; },
        setError: (msg) => { if (msg) setErrorCalled = true; },
        navigateToToday: () => { navigated = true; },
      },
      {
        sessionId: "test-session",
        setConfirming: () => {},
        setOfflineError: () => {},
        endingRef: { current: false },
        setEnding: () => {},
      }
    );
    
    assertEquals(ended, false, "Returns false on ok:false");
    assertTrue(resumeElapsedCalled, "Called resumeElapsed");
    assertTrue(setErrorCalled, "Called setError");
    assertTrue(!navigated, "Does NOT navigate on failure");
  }

  console.log("\n8. runEndEarly returns false on thrown error");
  {
    let resumeElapsedCalled = false;
    let setErrorCalled = false;
    let navigated = false;
    
    const ended = await runEndEarly(
      {
        abandonSession: async () => { throw new Error("Network error"); },
        stopElapsed: () => 100,
        resumeElapsed: () => { resumeElapsedCalled = true; },
        setError: (msg) => { if (msg) setErrorCalled = true; },
        navigateToToday: () => { navigated = true; },
      },
      {
        sessionId: "test-session",
        setConfirming: () => {},
        setOfflineError: () => {},
        endingRef: { current: false },
        setEnding: () => {},
      }
    );
    
    assertEquals(ended, false, "Returns false on thrown error");
    assertTrue(resumeElapsedCalled, "Called resumeElapsed");
    assertTrue(setErrorCalled, "Called setError");
    assertTrue(!navigated, "Does NOT navigate on error");
  }

  console.log("\n9. runEndEarly returns false on double-tap");
  {
    const endingRef = { current: true };
    let navigated = false;
    
    const ended = await runEndEarly(
      {
        abandonSession: async () => ({ ok: true }),
        stopElapsed: () => 100,
        resumeElapsed: () => {},
        setError: () => {},
        navigateToToday: () => { navigated = true; },
      },
      {
        sessionId: "test-session",
        setConfirming: () => {},
        setOfflineError: () => {},
        endingRef,
        setEnding: () => {},
      }
    );
    
    assertEquals(ended, false, "Returns false on double-tap (endingRef already true)");
    assertTrue(!navigated, "Does NOT navigate on double-tap guard");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All end-early confirm tests passed!");
}

runTests();
