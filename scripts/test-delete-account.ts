/**
 * Unit tests for account deletion functionality.
 * 
 * Tests the REAL deletion logic (src/app/settings/delete-account/deletion-logic.ts)
 * with mocked dependencies to verify:
 * - Unauthenticated requests are rejected
 * - Authenticated requests call the RPC function
 * - RPC success leads to sign-out and redirect
 * - RPC errors are handled gracefully without signing out
 * - Error messages are user-friendly
 */

import { performAccountDeletion, mapDeletionError } from "../src/app/settings/delete-account/deletion-logic";

export {}; // Make this a module to avoid global scope conflicts

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nAccount deletion action tests");
console.log("=============================\n");

async function runTests() {
  console.log("1. Authentication check");
  {
    let rpcCalled = false;
    let signedOut = false;
    
    const result = await performAccountDeletion({
      user: null,
      callRPC: async () => {
        rpcCalled = true;
        return { error: null };
      },
      signOut: async () => {
        signedOut = true;
      },
      redirect: () => {
        throw new Error("Should not redirect");
      },
    });
    
    check("unauthenticated request returns error", !result.ok);
    check("error message mentions authentication", result.ok === false && result.error === "Not signed in");
    check("does not call RPC", !rpcCalled);
    check("does not sign out", !signedOut);
  }

  console.log("\n2. Successful deletion");
  {
    let rpcCalled = false;
    let signedOut = false;
    let redirected = false;
    
    try {
      await performAccountDeletion({
        user: { id: "test-user-id", email: "test@example.com" },
        callRPC: async () => {
          rpcCalled = true;
          return { error: null };
        },
        signOut: async () => {
          signedOut = true;
        },
        redirect: (() => {
          redirected = true;
          // Simulate redirect() which never returns - throw to exit the function
          throw new Error("REDIRECT");
        }) as never,
      });
    } catch (e) {
      // Expected - redirect throws
      if ((e as Error).message !== "REDIRECT") throw e;
    }
    
    check("RPC is called", rpcCalled);
    check("signs out the user", signedOut);
    check("redirects to landing page", redirected);
  }

  console.log("\n3. RPC function not found (migration not applied)");
  {
    let signedOut = false;
    
    const result = await performAccountDeletion({
      user: { id: "test-user-id", email: "test@example.com" },
      callRPC: async () => ({
        error: { code: "42883", message: "function public.delete_own_account() does not exist" },
      }),
      signOut: async () => {
        signedOut = true;
      },
      redirect: () => {
        throw new Error("Should not redirect on error");
      },
    });
    
    check("returns error", !result.ok);
    check("error mentions migration needed", result.ok === false && result.error.includes("database migration"));
    check("keeps user signed in (no signOut call)", !signedOut);
  }

  console.log("\n4. Permission denied");
  {
    let signedOut = false;
    
    const result = await performAccountDeletion({
      user: { id: "test-user-id", email: "test@example.com" },
      callRPC: async () => ({
        error: { code: "42501", message: "permission denied for function delete_own_account" },
      }),
      signOut: async () => {
        signedOut = true;
      },
      redirect: () => {
        throw new Error("Should not redirect on error");
      },
    });
    
    check("returns error", !result.ok);
    check("error mentions permission", result.ok === false && result.error.includes("Permission denied"));
    check("keeps user signed in", !signedOut);
  }

  console.log("\n5. Network error");
  {
    let signedOut = false;
    
    const result = await performAccountDeletion({
      user: { id: "test-user-id", email: "test@example.com" },
      callRPC: async () => ({
        error: { message: "network timeout after 5s" },
      }),
      signOut: async () => {
        signedOut = true;
      },
      redirect: () => {
        throw new Error("Should not redirect on error");
      },
    });
    
    check("returns error", !result.ok);
    check("error mentions network", result.ok === false && result.error.includes("Network error"));
    check("keeps user signed in", !signedOut);
  }

  console.log("\n6. Generic error");
  {
    let signedOut = false;
    
    const result = await performAccountDeletion({
      user: { id: "test-user-id", email: "test@example.com" },
      callRPC: async () => ({
        error: { code: "UNKNOWN", message: "something went wrong" },
      }),
      signOut: async () => {
        signedOut = true;
      },
      redirect: () => {
        throw new Error("Should not redirect on error");
      },
    });
    
    check("returns error", !result.ok);
    check("error message is user-friendly", result.ok === false && result.error.includes("Please try again"));
    check("keeps user signed in", !signedOut);
  }

  console.log("\n7. Error mapping (pure function)");
  {
    check(
      "migration not applied error",
      mapDeletionError({ code: "42883" }).includes("database migration")
    );
    check(
      "function not found error",
      mapDeletionError({ message: "function does not exist" }).includes("database migration")
    );
    check(
      "permission error by code",
      mapDeletionError({ code: "42501" }).includes("Permission denied")
    );
    check(
      "permission error by message",
      mapDeletionError({ message: "permission denied" }).includes("Permission denied")
    );
    check(
      "network error",
      mapDeletionError({ message: "network timeout" }).includes("Network error")
    );
    check(
      "generic error",
      mapDeletionError({ code: "OTHER" }).includes("Please try again")
    );
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
