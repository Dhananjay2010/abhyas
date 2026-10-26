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
    check("error mentions function not available", result.ok === false && result.error.includes("isn't available right now"));
    check("error includes support contact", result.ok === false && result.error.includes("support@example.com"));
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

  console.log("\n7. OWN01 support contact resolution (3 branches)");
  {
    // Import branding to test the 3 branches
    const { branding } = await import("../src/lib/branding");
    
    // Test OWN01 includes support contact
    const msgOWN01 = mapDeletionError({ 
      code: "OWN01", 
      message: "You own Gym ABC. Transfer ownership before deleting your account." 
    });
    check(
      "OWN01 error shows gym name",
      msgOWN01.includes("Gym ABC")
    );
    check(
      "OWN01 error mentions transfer ownership",
      msgOWN01.includes("Transfer ownership")
    );
    check(
      "OWN01 error includes 'For assistance'",
      msgOWN01.includes("For assistance")
    );
    
    // Branch 1: Brand has supportEmail (highest priority)
    if (branding.supportEmail) {
      check(
        "OWN01 uses Brand.supportEmail when set",
        msgOWN01.includes(branding.supportEmail)
      );
      check(
        "OWN01 format: 'contact <email>'",
        msgOWN01.includes(`contact ${branding.supportEmail}`)
      );
    }
    // Branch 2: NEXT_PUBLIC_SUPPORT_EMAIL is set (medium priority)
    else if (process.env.NEXT_PUBLIC_SUPPORT_EMAIL) {
      check(
        "OWN01 uses NEXT_PUBLIC_SUPPORT_EMAIL when Brand.supportEmail not set",
        msgOWN01.includes(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)
      );
      check(
        "OWN01 format: 'contact <email>'",
        msgOWN01.includes(`contact ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`)
      );
    }
    // Branch 3: Neither is set (lowest priority fallback)
    else {
      check(
        "OWN01 uses fallback wording when no email configured",
        msgOWN01.includes("contact your gym's administrator")
      );
      check(
        "OWN01 does NOT include hardcoded email when unconfigured",
        !msgOWN01.includes("@")
      );
    }
    
    // Verify all branches produce well-formed messages
    check(
      "OWN01 always includes 'contact' in some form",
      msgOWN01.toLowerCase().includes("contact")
    );
    
    const msgOWN01NoMessage = mapDeletionError({ code: "OWN01" });
    check(
      "OWN01 without message shows fallback",
      msgOWN01NoMessage.includes("own a gym") && msgOWN01NoMessage.includes("Transfer ownership")
    );
    check(
      "OWN01 fallback also includes support contact",
      msgOWN01NoMessage.includes("For assistance")
    );

  }

  console.log("\n8. Other error codes");
  {
    const msg42883 = mapDeletionError({ code: "42883" });
    check(
      "42883 error is user-friendly",
      msg42883.includes("isn't available right now")
    );
    check(
      "42883 error includes support contact",
      msg42883.includes("support@example.com")
    );
    check(
      "42883 error does NOT mention migrations",
      !msg42883.toLowerCase().includes("migration")
    );
    
    const msgFnNotExist = mapDeletionError({ message: "function does not exist" });
    check(
      "function not found is user-friendly",
      msgFnNotExist.includes("isn't available")
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
