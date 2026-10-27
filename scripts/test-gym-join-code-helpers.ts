/**
 * Unit tests for gym join code helper functions.
 */

import { isJoinCodeActive, formatJoinCodeExpiry } from "../src/app/owner/invites/code-helpers";
import type { Database } from "../src/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function makeCode(overrides: Partial<JoinCode> = {}): JoinCode {
  return {
    id: "test-id",
    gym_id: "test-gym",
    code: "TEST1234",
    role: "member",
    created_by: "test-user",
    created_at: new Date().toISOString(),
    expires_at: null,
    max_uses: null,
    use_count: 0,
    revoked_at: null,
    ...overrides,
  };
}

console.log("TEST: isJoinCodeActive");
{
  const activeCode = makeCode();
  check("Active code is active", isJoinCodeActive(activeCode));

  const revokedCode = makeCode({ revoked_at: new Date().toISOString() });
  check("Revoked code is not active", !isJoinCodeActive(revokedCode));

  const expiredCode = makeCode({ expires_at: new Date(Date.now() - 1000).toISOString() });
  check("Expired code is not active", !isJoinCodeActive(expiredCode));

  const futureExpiry = makeCode({ expires_at: new Date(Date.now() + 100000).toISOString() });
  check("Code with future expiry is active", isJoinCodeActive(futureExpiry));

  const exhaustedCode = makeCode({ max_uses: 5, use_count: 5 });
  check("Exhausted code is not active", !isJoinCodeActive(exhaustedCode));

  const notExhaustedCode = makeCode({ max_uses: 5, use_count: 4 });
  check("Not-exhausted code is active", isJoinCodeActive(notExhaustedCode));

  const unlimitedCode = makeCode({ max_uses: null, use_count: 100 });
  check("Unlimited code (null max_uses) is active", isJoinCodeActive(unlimitedCode));
}
console.log();

console.log("TEST: formatJoinCodeExpiry");
{
  const noExpiry = makeCode({ expires_at: null });
  check("Code with no expiry returns null", formatJoinCodeExpiry(noExpiry) === null);

  const futureExpiry = makeCode({ expires_at: new Date(Date.now() + 100000).toISOString() });
  const futureText = formatJoinCodeExpiry(futureExpiry);
  check("Future expiry starts with 'Expires'", futureText?.startsWith("Expires") ?? false);

  const pastExpiry = makeCode({ expires_at: new Date(Date.now() - 1000).toISOString() });
  const pastText = formatJoinCodeExpiry(pastExpiry);
  check("Past expiry starts with 'Expired'", pastText?.startsWith("Expired") ?? false);
}
console.log();

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}

console.log("\n✅ All tests passed\n");
process.exit(0);
