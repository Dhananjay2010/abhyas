/**
 * test-signout-preventdefault.tsx
 * Verify that hydrated JS calls preventDefault() on form submit.
 * Tests the REAL SignOutForm and SignOutButton components.
 * 
 * Mutant: removing e.preventDefault() from either component must fail this test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import React from "react";
import { SignOutForm } from "../src/app/today/signout-form";
import { SignOutButton } from "../src/app/settings/signout-button";

describe("Sign-out form preventDefault", () => {
  it("SignOutForm prevents default form submission", async () => {
    const mockSignOut = async () => ({ ok: true } as const);
    const mockLogSet = async () => ({ ok: true } as const);
    
    const { container } = render(
      <SignOutForm 
        label="Sign out" 
        userId="test-user"
        signOut={mockSignOut}
        logSet={mockLogSet}
      />
    );

    const form = container.querySelector("form");
    assert.ok(form, "Form should exist");
    
    let defaultPrevented = false;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    
    // Override preventDefault to track if it was called
    const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
    submitEvent.preventDefault = () => {
      defaultPrevented = true;
      originalPreventDefault();
    };
    
    form.dispatchEvent(submitEvent);

    assert.strictEqual(
      defaultPrevented, 
      true, 
      "SignOutForm must call preventDefault (mutant: removing e.preventDefault() must fail this)"
    );
  });

  it("SignOutButton prevents default form submission", async () => {
    const mockSignOut = async () => ({ ok: true } as const);
    const mockLogSet = async () => ({ ok: true } as const);

    const { container } = render(
      <SignOutButton 
        userId="test-user"
        signOut={mockSignOut}
        logSet={mockLogSet}
      />
    );

    const form = container.querySelector("form");
    assert.ok(form, "Form should exist");
    
    let defaultPrevented = false;
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    
    const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
    submitEvent.preventDefault = () => {
      defaultPrevented = true;
      originalPreventDefault();
    };
    
    form.dispatchEvent(submitEvent);

    assert.strictEqual(
      defaultPrevented, 
      true, 
      "SignOutButton must call preventDefault (mutant: removing e.preventDefault() must fail this)"
    );
  });
});
