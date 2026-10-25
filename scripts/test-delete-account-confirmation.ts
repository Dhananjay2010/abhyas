/**
 * Unit tests for delete-account confirmation validation.
 * 
 * Tests the REAL isDeleteConfirmed function and server-side rejection logic to verify:
 * - Exact "DELETE" string is accepted (case-sensitive, no whitespace tolerance)
 * - Any variation (whitespace, different case, extra chars) is rejected
 * - Server-side validation prevents deletion when confirmation is wrong
 * 
 * Uses real code with injectable dependencies (no simulation or mocking).
 */

import { isDeleteConfirmed } from "../src/app/settings/delete-account/form-logic";
import { confirmAndDelete } from "../src/app/settings/delete-account/deletion-logic";

export {}; // Make this a module to avoid global scope conflicts

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nDelete account confirmation validation tests");
console.log("============================================\n");

async function runTests() {
  console.log("1. isDeleteConfirmed accepts exact match only");
  {
    check('accepts "DELETE"', isDeleteConfirmed("DELETE") === true);
    check('rejects " DELETE " (leading/trailing spaces)', isDeleteConfirmed(" DELETE ") === false);
    check('rejects "delete" (lowercase)', isDeleteConfirmed("delete") === false);
    check('rejects "DELETE\\n" (trailing newline)', isDeleteConfirmed("DELETE\n") === false);
    check('rejects "Delete" (wrong case)', isDeleteConfirmed("Delete") === false);
    check('rejects "" (empty string)', isDeleteConfirmed("") === false);
  }

  console.log("\n2. Additional edge cases");
  {
    check('rejects " DELETE" (leading space only)', isDeleteConfirmed(" DELETE") === false);
    check('rejects "DELETE " (trailing space only)', isDeleteConfirmed("DELETE ") === false);
    check('rejects "\\nDELETE" (leading newline)', isDeleteConfirmed("\nDELETE") === false);
    check('rejects "\\tDELETE" (leading tab)', isDeleteConfirmed("\tDELETE") === false);
    check('rejects "DELETE\\t" (trailing tab)', isDeleteConfirmed("DELETE\t") === false);
    check('rejects "DELETEEXTRA" (extra chars)', isDeleteConfirmed("DELETEEXTRA") === false);
    check('rejects "DELET" (incomplete)', isDeleteConfirmed("DELET") === false);
  }

  console.log("\n3. Server-side confirmation gate with real code");
  {
    // Test invalid confirmations: neither dependency should be called
    const invalidInputs = [
      { input: " DELETE ", desc: "with spaces" },
      { input: "delete", desc: "lowercase" },
      { input: "", desc: "empty" },
    ];

    for (const { input, desc } of invalidInputs) {
      let rateLimitCalled = false;
      let deleteAccountCalled = false;

      const result = await confirmAndDelete(input, {
        rateLimit: async () => {
          rateLimitCalled = true;
          return null;
        },
        deleteAccount: async () => {
          deleteAccountCalled = true;
          return { ok: true };
        },
      });

      check(`invalid confirmation ${desc}: returns error`, !result.ok);
      check(
        `invalid confirmation ${desc}: error message is correct`,
        result.ok === false && result.error === "Type DELETE to confirm."
      );
      check(`invalid confirmation ${desc}: does not call rateLimit`, !rateLimitCalled);
      check(`invalid confirmation ${desc}: does not call deleteAccount`, !deleteAccountCalled);
    }
  }

  console.log("\n4. Valid confirmation calls dependencies in order");
  {
    let rateLimitCalled = false;
    let deleteAccountCalled = false;
    const callOrder: string[] = [];

    const result = await confirmAndDelete("DELETE", {
      rateLimit: async () => {
        rateLimitCalled = true;
        callOrder.push("rateLimit");
        return null; // No rate limit error
      },
      deleteAccount: async () => {
        deleteAccountCalled = true;
        callOrder.push("deleteAccount");
        return { ok: true };
      },
    });

    check("valid confirmation: returns success", result.ok === true);
    check("valid confirmation: calls rateLimit", rateLimitCalled);
    check("valid confirmation: calls deleteAccount", deleteAccountCalled);
    check(
      "valid confirmation: calls in correct order",
      callOrder[0] === "rateLimit" && callOrder[1] === "deleteAccount"
    );
  }

  console.log("\n5. Rate limit blocks deletion");
  {
    let deleteAccountCalled = false;

    const result = await confirmAndDelete("DELETE", {
      rateLimit: async () => {
        return { ok: false, error: "Rate limit exceeded" };
      },
      deleteAccount: async () => {
        deleteAccountCalled = true;
        return { ok: true };
      },
    });

    check("rate limit error: returns error", !result.ok);
    check(
      "rate limit error: returns the rate limit error",
      result.ok === false && result.error === "Rate limit exceeded"
    );
    check("rate limit error: does not call deleteAccount", !deleteAccountCalled);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
