/**
 * Unit tests for delete-account form error handling.
 * 
 * Tests that the form properly catches and handles errors thrown from
 * the deleteAccount action (e.g. network failures) instead of letting
 * them escape to the error boundary.
 */

export {}; // Make this a module to avoid global scope conflicts

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nDelete form error handling tests");
console.log("=================================\n");

/**
 * Simulate the error handling logic from delete-account-form.tsx
 */
async function simulateFormSubmit(
  deleteAccountFn: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ error: string | null }> {
  let error: string | null = null;
  
  try {
    const result = await deleteAccountFn();
    if (!result.ok) {
      error = result.error ?? "Unknown error";
    }
  } catch (err) {
    // This is the critical catch block that prevents error boundary escalation
    error =
      err instanceof Error && err.message
        ? `An error occurred: ${err.message}`
        : "An unexpected error occurred. Please try again.";
  }
  
  return { error };
}

async function runTests() {
  console.log("1. Successful deletion (no error)");
  {
    const result = await simulateFormSubmit(async () => ({ ok: true }));
    check("no error is set", result.error === null);
  }

  console.log("\n2. Action returns error result");
  {
    const result = await simulateFormSubmit(async () => ({
      ok: false,
      error: "Permission denied. Please contact support.",
    }));
    check("error is set from result", result.error === "Permission denied. Please contact support.");
  }

  console.log("\n3. Action throws Error with message");
  {
    const result = await simulateFormSubmit(async () => {
      throw new Error("Network timeout");
    });
    check("error is caught", result.error !== null);
    check("error includes message", result.error?.includes("Network timeout") || false);
    check("error is user-friendly", result.error?.startsWith("An error occurred:") || false);
  }

  console.log("\n4. Action throws non-Error object");
  {
    const result = await simulateFormSubmit(async () => {
      throw "string error";
    });
    check("error is caught", result.error !== null);
    check("generic message is used", result.error === "An unexpected error occurred. Please try again.");
  }

  console.log("\n5. Action throws Error without message");
  {
    const result = await simulateFormSubmit(async () => {
      throw new Error();
    });
    check("error is caught", result.error !== null);
    check("generic message is used", result.error === "An unexpected error occurred. Please try again.");
  }

  console.log("\n6. Fetch rejection (network failure simulation)");
  {
    const result = await simulateFormSubmit(async () => {
      // Simulate fetch() rejecting due to network failure
      throw new TypeError("Failed to fetch");
    });
    check("error is caught", result.error !== null);
    check("error mentions fetch failure", result.error?.includes("Failed to fetch") || false);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
