/**
 * Test logSet validation with idempotent retry for ended sessions.
 * When a session has ended but the exact same set already exists,
 * allow the retry to succeed silently.
 * 
 *   npx tsx scripts/test-log-set-idempotent-retry.ts
 */

import { 
  validateSessionForLogSet,
  type LogSetValidationDeps,
  type SessionExerciseWithStatus,
  type ExistingSetRow
} from "../src/lib/session/log-set-validation";

class FakeLogSetValidationDeps implements LogSetValidationDeps {
  private sessionStatus: string | null = "in_progress";
  private existingSet: ExistingSetRow | null = null;
  private shouldThrowLookupSession = false;
  private shouldThrowLookupSet = false;
  
  lookupExistingSetCalled = false;

  setSessionStatus(status: string | null) {
    this.sessionStatus = status;
  }

  setExistingSet(set: ExistingSetRow | null) {
    this.existingSet = set;
  }

  setThrowLookupSession(shouldThrow: boolean) {
    this.shouldThrowLookupSession = shouldThrow;
  }

  setThrowLookupSet(shouldThrow: boolean) {
    this.shouldThrowLookupSet = shouldThrow;
  }

  async lookupSessionExercise(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _sessionExerciseId: string
  ): Promise<SessionExerciseWithStatus | null> {
    if (this.shouldThrowLookupSession) {
      throw new Error("Lookup failed");
    }
    if (this.sessionStatus === null) {
      return null;
    }
    return {
      sessions: {
        status: this.sessionStatus,
      },
    };
  }

  async lookupExistingSet(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _sessionExerciseId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _setNumber: number
  ): Promise<ExistingSetRow | null> {
    this.lookupExistingSetCalled = true;
    if (this.shouldThrowLookupSet) {
      throw new Error("Lookup failed");
    }
    return this.existingSet;
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. in_progress session makes no lookupExistingSet call");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("in_progress");

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
  check("lookupExistingSet was not called", fake.lookupExistingSetCalled === false);
}

console.log("\n2. ended session + identical existing set returns success");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: "50",
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
  check("lookupExistingSet was called", fake.lookupExistingSetCalled === true);
}

console.log("\n3. ended session + same set number but different reps is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: "50",
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 12,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
    check("error message", result.error === "This session has ended.");
  }
}

console.log("\n4. ended session + same set number but different weight is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: "50",
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 55,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n5. ended session + same set number but different duration is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: null,
    weight_kg: null,
    duration_seconds: 30,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: null,
      weightKg: null,
      durationSeconds: 45,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n6. ended session + no existing set is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet(null);

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n7. ended session + failed set lookup is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setThrowLookupSet(true);

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n8. ended session + identical set with null weight");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 15,
    weight_kg: null,
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 15,
      weightKg: null,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
}

console.log("\n9. ended session + identical duration-based set");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("skipped");
  fake.setExistingSet({
    reps: null,
    weight_kg: null,
    duration_seconds: 60,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: null,
      weightKg: null,
      durationSeconds: 60,
    }
  );

  check("result is ok", result.ok === true);
}

console.log("\n10. ended session without setInput is rejected (backward compat)");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");

  const result = await validateSessionForLogSet(fake, "se1");

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
  check("lookupExistingSet was not called", fake.lookupExistingSetCalled === false);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
