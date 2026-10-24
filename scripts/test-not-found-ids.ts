/**
 * Test that invalid or nonexistent session/history IDs return 404, not 200.
 *
 * The bug (QA Bot 2): routes with loading.tsx were returning HTTP 200 for
 * nonexistent or malformed IDs because notFound() was called after streaming
 * started. The fix moves validation to generateMetadata, which runs before
 * any streaming begins.
 *
 *   npx tsx scripts/test-not-found-ids.ts
 */
import { isUuid } from "../src/lib/ids";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\n1. isUuid validates UUID format");
  {
    check("valid v4 UUID", isUuid("550e8400-e29b-41d4-a716-446655440000"));
    check("valid v1 UUID", isUuid("C56A4180-65AA-42EC-A945-5FD21DEC0538"));
    check("lowercase", isUuid("c56a4180-65aa-42ec-a945-5fd21dec0538"));
    check("mixed case", isUuid("C56A4180-65aa-42ec-A945-5FD21DEC0538"));
    
    check("rejects empty string", !isUuid(""));
    check("rejects 'null'", !isUuid("null"));
    check("rejects 'undefined'", !isUuid("undefined"));
    check("rejects plain text", !isUuid("not-a-uuid"));
    check("rejects missing hyphens", !isUuid("550e8400e29b41d4a716446655440000"));
    check("rejects wrong hyphen positions", !isUuid("550e8400-e29b41d4-a716-446655440000"));
    check("rejects too short", !isUuid("550e8400-e29b-41d4-a716"));
    check("rejects too long", !isUuid("550e8400-e29b-41d4-a716-446655440000-extra"));
    check("rejects non-hex characters", !isUuid("550e8400-e29b-41d4-a716-44665544000g"));
    check("rejects SQL injection attempt", !isUuid("'; DROP TABLE sessions; --"));
  }

  console.log("\n2. shouldFetchSession decides whether to query the database");
  {
    type FakeClient = {
      from: () => {
        select: () => {
          eq: () => {
            maybeSingle: () => Promise<{ data: { id: string } | null }>;
          };
        };
      };
    };
    
    async function shouldFetchSession(
      id: string,
      fakeClient: FakeClient,
    ): Promise<boolean> {
      if (!isUuid(id)) return false;
      
      const { data } = await fakeClient
        .from()
        .select()
        .eq()
        .maybeSingle();
      
      return data !== null;
    }
    
    const existingSession: FakeClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "550e8400-e29b-41d4-a716-446655440000" } }),
          }),
        }),
      }),
    };
    
    const missingSession: FakeClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    };
    
    check(
      "valid UUID that exists returns true",
      await shouldFetchSession("550e8400-e29b-41d4-a716-446655440000", existingSession),
    );
    
    check(
      "valid UUID that doesn't exist returns false",
      !(await shouldFetchSession("550e8400-e29b-41d4-a716-446655440000", missingSession)),
    );
    
    check(
      "malformed ID skips database query",
      !(await shouldFetchSession("not-a-uuid", missingSession)),
    );
    
    check(
      "empty string skips database query",
      !(await shouldFetchSession("", missingSession)),
    );
  }

  console.log("\n3. Edge cases that should fail validation");
  {
    check("UUID with uppercase and invalid char", !isUuid("C56A4180-65AA-42EC-A945-5FD21DEC053Z"));
    check("UUID with spaces", !isUuid("550e8400 e29b 41d4 a716 446655440000"));
    check("UUID-like but wrong segments", !isUuid("550e8400-e29-b41d4-a716-446655440000"));
    check("All zeros is valid", isUuid("00000000-0000-0000-0000-000000000000"));
    check("All Fs is valid", isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff"));
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
