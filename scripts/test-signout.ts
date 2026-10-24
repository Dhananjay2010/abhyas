/**
 * Sign-out logic tests
 *
 * Tests the extracted performSignOut function to ensure:
 * 1. It awaits signOut before redirecting
 * 2. It doesn't redirect on error
 * 3. It returns the error message to the caller
 *
 * Run with: npm run test:signout
 */

import { performSignOut } from "../src/lib/auth/signout";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\n1. Sign-out awaits signOut before redirecting");
  {
    let signOutCalled = false;
    let redirectCalled = false;
    let signOutResolvedBeforeRedirect = false;

    const mockSignOut = async () => {
      signOutCalled = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      signOutResolvedBeforeRedirect = !redirectCalled;
      return { error: null };
    };

    const mockRedirect = (() => {
      redirectCalled = true;
      throw new Error("REDIRECT");
    }) as never;

    try {
      await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });
    } catch {
      // redirect throws, which is expected
    }

    check("signOut was called", signOutCalled);
    check("redirect was called", redirectCalled);
    check("signOut resolved before redirect", signOutResolvedBeforeRedirect);
  }

  console.log("\n2. Sign-out does not redirect on error");
  {
    const errorMessage = "Network error";
    let redirectCalled = false;

    const mockSignOut = async () => ({
      error: new Error(errorMessage),
    });

    const mockRedirect = (() => {
      redirectCalled = true;
      throw new Error("REDIRECT");
    }) as never;

    const result = await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });

    check("redirect was not called", !redirectCalled);
    check("returns error result", !result.ok && result.error === errorMessage, result.ok ? "returned ok: true" : result.error);
  }

  console.log("\n3. Sign-out returns error message to caller");
  {
    const errorMessage = "Invalid session";

    const mockSignOut = async () => ({
      error: new Error(errorMessage),
    });

    const mockRedirect = (() => {
      throw new Error("REDIRECT");
    }) as never;

    const result = await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });

    check("result.ok is false", result.ok === false);
    check("result.error matches error message", !result.ok && result.error === errorMessage, !result.ok ? result.error : "ok: true");
  }

  console.log("\n4. Sign-out calls redirect with correct path");
  {
    let redirectPath = "";

    const mockSignOut = async () => ({ error: null });

    const mockRedirect = ((path: string) => {
      redirectPath = path;
      throw new Error("REDIRECT");
    }) as never;

    try {
      await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });
    } catch {
      // expected
    }

    check("redirects to /", redirectPath === "/", `got ${redirectPath}`);
  }

  console.log("\n5. Sign-out handles null error correctly");
  {
    let redirectCalled = false;

    const mockSignOut = async () => ({ error: null });

    const mockRedirect = (() => {
      redirectCalled = true;
      throw new Error("REDIRECT");
    }) as never;

    try {
      await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });
    } catch {
      // expected
    }

    check("redirect was called on success", redirectCalled);
  }

  console.log("\n6. Sign-out does not swallow signOut errors");
  {
    const mockSignOut = async () => {
      // Simulate an unexpected throw (not error in result)
      throw new Error("Unexpected signOut error");
    };

    const mockRedirect = (() => {
      throw new Error("REDIRECT");
    }) as never;

    let threwError = false;
    try {
      await performSignOut({ signOut: mockSignOut, redirect: mockRedirect });
    } catch (err) {
      if (err instanceof Error && err.message === "Unexpected signOut error") {
        threwError = true;
      }
    }

    check("unexpected errors propagate", threwError);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
