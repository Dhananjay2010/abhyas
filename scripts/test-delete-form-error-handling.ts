/**
 * Unit tests for delete-account form error handling.
 * 
 * Tests the REAL deleteErrorMessage function from form-logic.ts to verify:
 * - Success results return null
 * - Error results return the error message
 * - Thrown errors return a fixed friendly message (no raw exception text)
 * - Technical details are logged but not shown to users
 * 
 * Also tests the REAL isDeleteConfirmed function to verify exact-match confirmation.
 */

import { deleteErrorMessage, isDeleteConfirmed } from "../src/app/settings/delete-account/form-logic";

export {}; // Make this a module to avoid global scope conflicts

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nDelete form error handling tests");
console.log("=================================\n");

function runTests() {
  console.log("1. Successful deletion (no error)");
  {
    const error = deleteErrorMessage({ ok: true });
    check("no error is returned", error === null);
  }

  console.log("\n2. Action returns error result");
  {
    const error = deleteErrorMessage({
      ok: false,
      error: "Permission denied. Please contact support.",
    });
    check("error is returned from result", error === "Permission denied. Please contact support.");
  }

  console.log("\n3. Action throws Error with message");
  {
    const error = deleteErrorMessage({ thrown: new Error("Network timeout") });
    check("error is a fixed friendly message", error === "Couldn't reach the server. Check your connection and try again.");
    check("error does NOT contain raw exception", !error?.includes("Network timeout"));
  }

  console.log("\n4. Action throws non-Error object");
  {
    const error = deleteErrorMessage({ thrown: "string error" });
    check("error is the fixed friendly message", error === "Couldn't reach the server. Check your connection and try again.");
  }

  console.log("\n5. Action throws Error without message");
  {
    const error = deleteErrorMessage({ thrown: new Error() });
    check("error is the fixed friendly message", error === "Couldn't reach the server. Check your connection and try again.");
  }

  console.log("\n6. Fetch rejection (TypeError)");
  {
    const error = deleteErrorMessage({ thrown: new TypeError("Failed to fetch") });
    check("error is the fixed friendly message", error === "Couldn't reach the server. Check your connection and try again.");
    check("error does NOT expose TypeError", !error?.includes("TypeError"));
    check("error does NOT expose 'Failed to fetch'", !error?.includes("Failed to fetch"));
  }

  console.log("\n7. Generic thrown object");
  {
    const error = deleteErrorMessage({ thrown: { code: 500, detail: "Internal error" } });
    check("error is the fixed friendly message", error === "Couldn't reach the server. Check your connection and try again.");
  }

  console.log("\n8. Action returns undefined (redirect case)");
  {
    const error = deleteErrorMessage(undefined);
    check("no error is returned", error === null);
  }

  console.log("\n9. Action returns null");
  {
    const error = deleteErrorMessage(null);
    check("no error is returned", error === null);
  }

  console.log("\n10. isDeleteConfirmed - exact match");
  {
    check("accepts exact 'DELETE'", isDeleteConfirmed("DELETE") === true);
  }

  console.log("\n11. isDeleteConfirmed - with leading space");
  {
    check("rejects ' DELETE'", isDeleteConfirmed(" DELETE") === false);
  }

  console.log("\n12. isDeleteConfirmed - with trailing space");
  {
    check("rejects 'DELETE '", isDeleteConfirmed("DELETE ") === false);
  }

  console.log("\n13. isDeleteConfirmed - with both spaces");
  {
    check("rejects ' DELETE '", isDeleteConfirmed(" DELETE ") === false);
  }

  console.log("\n14. isDeleteConfirmed - lowercase");
  {
    check("rejects 'delete'", isDeleteConfirmed("delete") === false);
  }

  console.log("\n15. isDeleteConfirmed - with newline");
  {
    check("rejects 'DELETE\\n'", isDeleteConfirmed("DELETE\n") === false);
  }

  console.log("\n16. isDeleteConfirmed - empty string");
  {
    check("rejects empty string", isDeleteConfirmed("") === false);
  }

  console.log("\n17. isDeleteConfirmed - mixed case");
  {
    check("rejects 'Delete'", isDeleteConfirmed("Delete") === false);
    check("rejects 'DeLeTe'", isDeleteConfirmed("DeLeTe") === false);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
