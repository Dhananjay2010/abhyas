/**
 * Test: Host-wins notice component
 *
 * Tests the notice shown when user's gym differs from host's gym.
 * Uses jsdom to render the component and verify behavior.
 */

import "./helpers/setup-jsdom";

import { render, screen, cleanup } from "@testing-library/react";
import { HostWinsNotice } from "../src/components/host-wins-notice";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function main() {
  console.log("TEST: Notice not shown when gyms match");
  {
    const { container } = render(
      <HostWinsNotice userGymName="FitCore" hostGymName="FitCore" />
    );
    check("No notice rendered", container.firstChild === null);
    cleanup();
  }
  console.log();

  console.log("TEST: Notice not shown when no user gym");
  {
    const { container } = render(
      <HostWinsNotice userGymName={null} hostGymName="FitCore" />
    );
    check("No notice rendered", container.firstChild === null);
    cleanup();
  }
  console.log();

  console.log("TEST: Notice not shown when no host gym");
  {
    const { container } = render(
      <HostWinsNotice userGymName="FitCore" hostGymName={null} />
    );
    check("No notice rendered", container.firstChild === null);
    cleanup();
  }
  console.log();

  console.log("TEST: Notice shown when gyms differ");
  {
    render(
      <HostWinsNotice userGymName="Gym A" hostGymName="Gym B" />
    );
    
    const notice = screen.queryByRole("status");
    check("Notice has role=status", notice !== null);
    
    if (notice) {
      const text = notice.textContent || "";
      check("Contains user gym name", text.includes("Gym A"));
      check("Contains host gym name", text.includes("Gym B"));
      check("Has 'signed in to' text", text.includes("You're signed in to"));
      check("Has 'this site is' text", text.includes("this site is"));
    }
    cleanup();
  }
  console.log();

  console.log("TEST: Notice has dismiss button");
  {
    render(
      <HostWinsNotice userGymName="Gym A" hostGymName="Gym B" />
    );
    
    const dismissButton = screen.queryByLabelText("Dismiss notice");
    check("Has dismiss button", dismissButton !== null);
    
    if (dismissButton) {
      check("Dismiss button is a button", dismissButton.tagName === 'BUTTON');
    }
    cleanup();
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
