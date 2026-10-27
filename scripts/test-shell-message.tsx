#!/usr/bin/env tsx
/*
 * Test: Shell message rendering
 *
 * Tests that the Shell component renders the informational message with correct styling.
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Shell } from "../src/app/session/[id]/session-runner";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function testShellMessage(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertContains(html: string, substring: string, msg: string) {
  if (!html.includes(substring)) {
    throw new Error(`${msg}\nExpected to contain: ${substring}\nGot: ${html}`);
  }
}

async function main() {
  console.log("Testing Shell message rendering\n");

  // Test 1: No message renders nothing
  await testShellMessage("No message → no message element", () => {
    const html = renderToStaticMarkup(
      <Shell
        title="TEST"
        subtitle={null}
        elapsed={0}
        onExit={() => {}}
        wakeLock={{ active: false }}
        error={null}
        message={null}
      >
        <div>content</div>
      </Shell>
    );
    if (html.includes("mt-4 rounded-lg border border-border bg-surface-2")) {
      throw new Error("Should not render message element when message is null");
    }
  });

  // Test 2: Message renders with correct styling (border-border bg-surface-2 text-fg)
  await testShellMessage("Message renders with border-border bg-surface-2 text-fg", () => {
    const html = renderToStaticMarkup(
      <Shell
        title="TEST"
        subtitle={null}
        elapsed={0}
        onExit={() => {}}
        wakeLock={{ active: false }}
        error={null}
        message="That set was already saved. Showing your latest sets."
      >
        <div>content</div>
      </Shell>
    );
    assertContains(
      html,
      'class="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg"',
      "Message should have correct classes",
    );
    assertContains(
      html,
      "That set was already saved. Showing your latest sets.",
      "Message text should be rendered",
    );
  });

  // Test 3: Message does not use border-info (regression)
  await testShellMessage("Message does not use border-info", () => {
    const html = renderToStaticMarkup(
      <Shell
        title="TEST"
        subtitle={null}
        elapsed={0}
        onExit={() => {}}
        wakeLock={{ active: false }}
        error={null}
        message="Test message"
      >
        <div>content</div>
      </Shell>
    );
    if (html.includes("border-info")) {
      throw new Error("Should not use border-info (no such token in globals.css)");
    }
    if (html.includes("bg-info")) {
      throw new Error("Should not use bg-info (no such token in globals.css)");
    }
    if (html.includes("text-info")) {
      throw new Error("Should not use text-info (no such token in globals.css)");
    }
  });

  // Test 4: Error still uses border-danger
  await testShellMessage("Error renders with border-danger (unchanged)", () => {
    const html = renderToStaticMarkup(
      <Shell
        title="TEST"
        subtitle={null}
        elapsed={0}
        onExit={() => {}}
        wakeLock={{ active: false }}
        error="Something went wrong"
        message={null}
      >
        <div>content</div>
      </Shell>
    );
    assertContains(
      html,
      'class="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"',
      "Error should have danger styling",
    );
    assertContains(html, "Something went wrong", "Error text should be rendered");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
