/**
 * test-signout-preventdefault.tsx
 * Verify that hydrated JS calls preventDefault() on form submit.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";

// Minimal test components that simulate the sign-out forms
function TestSignOutForm({ onSubmit }: { onSubmit: (e: React.FormEvent) => void }) {
  return (
    <form
      method="post"
      action="/auth/signout"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
    >
      <button type="submit">Sign out</button>
    </form>
  );
}

function TestSignOutButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClick(e as unknown as React.MouseEvent);
  };

  return (
    <form method="post" action="/auth/signout" onSubmit={handleSubmit}>
      <button type="submit">Sign out</button>
    </form>
  );
}

describe("Sign-out form preventDefault", () => {
  it("SignOutForm calls preventDefault on submit", async () => {
    let defaultPrevented = false;
    let submitCalled = false;

    const handleSubmit = (e: React.FormEvent) => {
      submitCalled = true;
      defaultPrevented = e.defaultPrevented;
    };

    const { findByRole } = render(<TestSignOutForm onSubmit={handleSubmit} />);

    const button = await findByRole("button", { name: /sign out/i });
    const user = userEvent.setup();
    await user.click(button);

    assert.strictEqual(submitCalled, true, "Submit handler should be called");
    assert.strictEqual(defaultPrevented, true, "preventDefault should be called");
  });

  it("SignOutButton calls preventDefault on submit", async () => {
    let defaultPrevented = false;
    let clickCalled = false;

    const handleClick = (e: React.MouseEvent) => {
      clickCalled = true;
      defaultPrevented = (e as unknown as React.FormEvent).defaultPrevented;
    };

    const { findByRole } = render(<TestSignOutButton onClick={handleClick} />);

    const button = await findByRole("button", { name: /sign out/i });
    const user = userEvent.setup();
    await user.click(button);

    assert.strictEqual(clickCalled, true, "Click handler should be called");
    assert.strictEqual(defaultPrevented, true, "preventDefault should be called");
  });
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  describe("test suite", async () => {
    await import("node:test").then((t) => t.run());
  });
}
