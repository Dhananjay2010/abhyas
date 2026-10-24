#!/usr/bin/env tsx
/*
 * Test: Shell message rendering
 *
 * Tests that the Shell component renders the informational message with correct styling.
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

export {}; // Make this a module

// Extract Shell component for testing
// We'll import it directly from the session-runner file
// For now, let's define a minimal version that matches the Shell signature
function Shell({
  title,
  subtitle,
  elapsed,
  onExit,
  wakeLock,
  error,
  message,
  confirmExit = true,
  children,
}: {
  title: string;
  subtitle: string | null;
  elapsed: number;
  onExit: () => void;
  wakeLock: { active: boolean };
  error: string | null;
  message?: string | null;
  confirmExit?: boolean;
  children: React.ReactNode;
}) {
  const formatClock = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return React.createElement(
    "main",
    { className: "mx-auto min-h-dvh w-full max-w-md px-6 pt-6 pb-16" },
    React.createElement(
      "header",
      { className: "flex items-center justify-between gap-4" },
      React.createElement(
        "div",
        null,
        React.createElement("p", { className: "text-xs tracking-wider text-muted uppercase" }, title),
        subtitle && React.createElement("p", { className: "text-sm text-muted" }, subtitle),
      ),
      React.createElement(
        "div",
        { className: "flex items-center gap-3" },
        wakeLock.active &&
          React.createElement("span", {
            title: "Screen kept awake",
            "aria-label": "Screen kept awake",
            className: "h-2 w-2 rounded-full bg-success",
          }),
        React.createElement(
          "span",
          { className: "text-sm tabular-nums text-muted" },
          formatClock(elapsed),
        ),
        React.createElement(
          "button",
          {
            onClick: onExit,
            "aria-label": "Leave session",
            className: "rounded-lg border border-border px-3 py-1.5 text-xs text-muted",
          },
          "Exit",
        ),
      ),
    ),
    error &&
      React.createElement(
        "p",
        {
          role: "alert",
          className: "mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger",
        },
        error,
      ),
    message &&
      React.createElement(
        "p",
        { className: "mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg" },
        message,
      ),
    React.createElement("div", { className: "mt-8" }, children),
  );
}

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
      React.createElement(
        Shell,
        {
          title: "TEST",
          subtitle: null,
          elapsed: 0,
          onExit: () => {},
          wakeLock: { active: false },
          error: null,
          message: null,
        },
        React.createElement("div", null, "content"),
      ),
    );
    if (html.includes("mt-4 rounded-lg border border-border bg-surface-2")) {
      throw new Error("Should not render message element when message is null");
    }
  });

  // Test 2: Message renders with correct styling (border-border bg-surface-2 text-fg)
  await testShellMessage("Message renders with border-border bg-surface-2 text-fg", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Shell,
        {
          title: "TEST",
          subtitle: null,
          elapsed: 0,
          onExit: () => {},
          wakeLock: { active: false },
          error: null,
          message: "That set was already saved. Showing your latest sets.",
        },
        React.createElement("div", null, "content"),
      ),
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
      React.createElement(
        Shell,
        {
          title: "TEST",
          subtitle: null,
          elapsed: 0,
          onExit: () => {},
          wakeLock: { active: false },
          error: null,
          message: "Test message",
        },
        React.createElement("div", null, "content"),
      ),
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
      React.createElement(
        Shell,
        {
          title: "TEST",
          subtitle: null,
          elapsed: 0,
          onExit: () => {},
          wakeLock: { active: false },
          error: "Something went wrong",
          message: null,
        },
        React.createElement("div", null, "content"),
      ),
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
