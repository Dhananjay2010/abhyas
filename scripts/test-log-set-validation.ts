/**
 * Test logSet session validation:
 * - Rejects when session is completed
 * - Rejects when session is skipped
 * - Rejects when session lookup returns no row
 * - Rejects when session lookup returns error
 * - Allows writes to in_progress sessions
 * 
 *   npx tsx scripts/test-log-set-validation.ts
 */

import { 
  validateSessionForLogSet,
  type LogSetValidationDeps,
  type SessionExerciseWithStatus
} from "../src/lib/session/log-set-validation";

class FakeLogSetValidationDeps implements LogSetValidationDeps {
  private sessions = new Map<string, { status: string } | null>();
  private errors = new Map<string, Error>();

  setSessionExercise(id: string, status: string | null) {
    if (status === null) {
      this.sessions.set(id, null);
    } else {
      this.sessions.set(id, { status });
    }
  }

  setLookupError(id: string, error: Error) {
    this.errors.set(id, error);
  }

  async lookupSessionExercise(sessionExerciseId: string): Promise<SessionExerciseWithStatus | null> {
    const error = this.errors.get(sessionExerciseId);
    if (error) {
      throw error;
    }

    const session = this.sessions.get(sessionExerciseId);
    if (session === undefined) {
      return null;
    }

    if (session === null) {
      return null;
    }

    return { sessions: session };
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Allows writes to in_progress sessions");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionExercise("se1", "in_progress");

  const result = await validateSessionForLogSet(fake, "se1");

  check("validation passes for in_progress", result.ok === true);
}

console.log("\n2. Rejects writes to completed sessions");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionExercise("se2", "completed");

  const result = await validateSessionForLogSet(fake, "se2");

  check("validation fails for completed", result.ok === false);
  check("code is SESSION_ENDED", !result.ok && result.code === "SESSION_ENDED");
  check("error message present", !result.ok && result.error === "This session has ended.");
}

console.log("\n3. Rejects writes to skipped sessions");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionExercise("se3", "skipped");

  const result = await validateSessionForLogSet(fake, "se3");

  check("validation fails for skipped", result.ok === false);
  check("code is SESSION_ENDED", !result.ok && result.code === "SESSION_ENDED");
}

console.log("\n4. Rejects when session exercise not found (null)");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionExercise("se4", null);

  const result = await validateSessionForLogSet(fake, "se4");

  check("validation fails for null", result.ok === false);
  check("code is SESSION_NOT_FOUND", !result.ok && result.code === "SESSION_NOT_FOUND");
  check("error message present", !result.ok && result.error === "Session not found.");
}

console.log("\n5. Rejects when lookup returns error");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setLookupError("se5", new Error("Database error"));

  const result = await validateSessionForLogSet(fake, "se5");

  check("validation fails for lookup error", result.ok === false);
  check("code is SESSION_NOT_FOUND", !result.ok && result.code === "SESSION_NOT_FOUND");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
