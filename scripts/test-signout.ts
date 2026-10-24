/**
 * Sign-out logic tests
 *
 * Tests the extracted performSignOut function to ensure:
 * 1. It awaits signOut before redirecting
 * 2. It doesn't redirect on error
 * 3. It returns the error message to the caller
 *
 * Tests the isSameOriginRequest function to ensure:
 * 1. Same-origin requests are allowed
 * 2. Cross-site requests are rejected
 * 3. Missing headers are rejected
 *
 * Run with: npm run test:signout
 */

import { performSignOut } from "../src/lib/auth/signout";
import { isSameOriginRequest } from "../src/app/auth/signout/route";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers,
  });
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

  console.log("\n7. Same-origin requests are allowed");
  {
    const req = createRequest("https://example.com/auth/signout", {
      origin: "https://example.com",
    });
    check("matching Origin header", isSameOriginRequest(req));
  }

  console.log("\n8. Sec-Fetch-Site same-origin is allowed");
  {
    const req = createRequest("https://example.com/auth/signout", {
      "sec-fetch-site": "same-origin",
    });
    check("Sec-Fetch-Site: same-origin", isSameOriginRequest(req));
  }

  console.log("\n9. Cross-site requests are rejected");
  {
    const req = createRequest("https://example.com/auth/signout", {
      origin: "https://evil.example",
    });
    check("different Origin header", !isSameOriginRequest(req));
  }

  console.log("\n10. Cross-site Sec-Fetch-Site is rejected");
  {
    const req = createRequest("https://example.com/auth/signout", {
      "sec-fetch-site": "cross-site",
    });
    check("Sec-Fetch-Site: cross-site", !isSameOriginRequest(req));
  }

  console.log("\n11. Missing headers are rejected");
  {
    const req = createRequest("https://example.com/auth/signout", {});
    check("no Origin or Sec-Fetch-Site headers", !isSameOriginRequest(req));
  }

  console.log("\n12. Same-origin with different port matches");
  {
    const req = createRequest("https://example.com:3000/auth/signout", {
      origin: "https://example.com:3000",
    });
    check("same origin with port", isSameOriginRequest(req));
  }

  console.log("\n13. Different port is rejected");
  {
    const req = createRequest("https://example.com:3000/auth/signout", {
      origin: "https://example.com:4000",
    });
    check("different port", !isSameOriginRequest(req));
  }

  console.log("\n14. HTTP vs HTTPS is rejected");
  {
    const req = createRequest("https://example.com/auth/signout", {
      origin: "http://example.com",
    });
    check("different protocol", !isSameOriginRequest(req));
  }

  console.log("\n15. Sec-Fetch-Site overrides mismatched Origin");
  {
    // This is a realistic case: a browser might send both headers,
    // and we trust Sec-Fetch-Site when it says same-origin
    const req = createRequest("https://example.com/auth/signout", {
      origin: "https://different.com",
      "sec-fetch-site": "same-origin",
    });
    check("Sec-Fetch-Site same-origin with different Origin", isSameOriginRequest(req));
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
