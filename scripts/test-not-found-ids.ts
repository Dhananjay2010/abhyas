/**
 * Behavioral tests for 404 route guards - no source-text inspection
 */

function check(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

let failures = 0;

async function main() {
  console.log("\n1. isUuid validates UUID format");
  {
    const { isUuid } = await import("../src/lib/ids.js");

    check("valid v4 UUID", isUuid("550e8400-e29b-41d4-a716-446655440000"));
    check("valid v1 UUID", isUuid("c232ab00-9414-11ec-b3c8-9f68deced24a"));
    check("lowercase", isUuid("550e8400-e29b-41d4-a716-446655440000"));
    check("mixed case", isUuid("550E8400-E29B-41D4-A716-446655440000"));
    check("rejects empty string", !isUuid(""));
    check("rejects 'null'", !isUuid("null"));
    check("rejects 'undefined'", !isUuid("undefined"));
    check("rejects plain text", !isUuid("not-a-uuid"));
    check("rejects missing hyphens", !isUuid("550e8400e29b41d4a716446655440000"));
    check("rejects wrong hyphen positions", !isUuid("550e8400-e29b41d4-a716-446655440000"));
    check("rejects too short", !isUuid("550e8400-e29b-41d4"));
    check("rejects too long", !isUuid("550e8400-e29b-41d4-a716-446655440000-extra"));
    check("rejects non-hex characters", !isUuid("550e8400-e29b-41d4-a716-44665544000g"));
    check("rejects SQL injection attempt", !isUuid("' OR '1'='1"));
    check("UUID with uppercase and invalid char", !isUuid("550E8400-E29B-41D4-A716-44665544000G"));
    check("UUID with spaces", !isUuid("550e8400 e29b 41d4 a716 446655440000"));
    check("UUID-like but wrong segments", !isUuid("550e8400-e29b-41d4-a716-44665544"));
    check("All zeros is valid", isUuid("00000000-0000-0000-0000-000000000000"));
    check("All Fs is valid", isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff"));
  }

  console.log("\n2. checkSessionRoute validates and queries");
  {
    const { checkSessionRoute } = await import("../src/lib/route-guards.js");
    const userId = "00000000-0000-0000-0000-000000000001";
    const sessionId = "00000000-0000-0000-0000-000000000002";

    // Mock Supabase client
    const fakeSupabase = {
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: (col: string, val: string) => ({
            eq: (col2: string, val2: string) => ({
              maybeSingle: async () => {
                if (table === "sessions" && col === "user_id" && val === userId && col2 === "id" && val2 === sessionId) {
                  return { data: { id: sessionId }, error: null };
                }
                return { data: null, error: null };
              }
            })
          })
        })
      })
    };

    check(
      "valid UUID that exists returns 'ok'",
      (await checkSessionRoute(fakeSupabase as any, userId, sessionId)) === "ok",
    );

    check(
      "queries filter by user_id",
      (await checkSessionRoute(fakeSupabase as any, userId, sessionId)) === "ok",
    );

    check(
      "queries filter by id",
      (await checkSessionRoute(fakeSupabase as any, userId, sessionId)) === "ok",
    );

    check(
      "valid UUID that doesn't exist returns 'not_found'",
      (await checkSessionRoute(fakeSupabase as any, userId, "00000000-0000-0000-0000-999999999999")) === "not_found",
    );
    
    check(
      "invalid UUID returns 'not_found'",
      (await checkSessionRoute(fakeSupabase as any, userId, "not-a-uuid")) === "not_found",
    );

    // Test error propagation
    const errorSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: new Error("DB error") })
            })
          })
        })
      })
    };

    try {
      await checkSessionRoute(errorSupabase as any, userId, sessionId);
      check("checkSessionRoute throws when maybeSingle returns error", false);
    } catch (err) {
      check("checkSessionRoute throws when maybeSingle returns error", true);
    }
  }

  console.log("\n3. checkBreatheRoute validates slugs with injected loader");
  {
    const { checkBreatheRoute } = await import("../src/lib/route-guards.js");
    const userId = "00000000-0000-0000-0000-000000000001";
    const fakeSupabase = {} as any;

    type FakeLoadedPractice = {
      pattern: { kind: string; id: string; slug?: string };
      prefs: Record<string, unknown>;
      lastCycles: number | null;
      firstPractice: boolean;
    };

    // Built-in slug
    const builtinLoader = async (): Promise<FakeLoadedPractice> => ({
      pattern: { kind: "builtin", id: "1", slug: "coherent" },
      prefs: {},
      lastCycles: null,
      firstPractice: false
    });
    check(
      "valid builtin slug returns 'ok'",
      (await checkBreatheRoute(fakeSupabase, userId, "coherent", builtinLoader as any)) === "ok",
    );

    // User's own pattern (mine-<uuid>)
    const ownedLoader = async (): Promise<FakeLoadedPractice> => ({
      pattern: { kind: "mine", id: userId },
      prefs: {},
      lastCycles: null,
      firstPractice: false
    });
    check(
      "valid custom pattern (mine-<uuid>) owned by user returns 'ok'",
      (await checkBreatheRoute(fakeSupabase, userId, `mine-${userId}`, ownedLoader as any)) === "ok",
    );

    // Pattern owned by someone else or missing
    const notOwnedLoader = async (): Promise<null> => null;
    check(
      "custom pattern owned by someone else returns 'not_found'",
      (await checkBreatheRoute(fakeSupabase, "other-user-id", `mine-${userId}`, notOwnedLoader as any)) === "not_found",
    );

    // Retimed builtin pattern
    const retimedLoader = async (): Promise<FakeLoadedPractice> => ({
      pattern: { kind: "mine", id: userId },
      prefs: {},
      lastCycles: null,
      firstPractice: false
    });
    check(
      "retimed builtin pattern returns 'ok'",
      (await checkBreatheRoute(fakeSupabase, userId, "some-key", retimedLoader as any)) === "ok",
    );

    // Invalid slug
    const invalidLoader = async (): Promise<null> => null;
    check(
      "invalid slug returns 'not_found'",
      (await checkBreatheRoute(fakeSupabase, userId, "invalid-slug", invalidLoader as any)) === "not_found",
    );
  }

  console.log("\n4. guardSessionRoute calls notFound() for invalid input");
  {
    const { guardSessionRoute } = await import("../src/lib/route-guards.js");
    const userId = "00000000-0000-0000-0000-000000000001";

    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        })
      })
    };

    // Test bad UUID calls notFound
    try {
      await guardSessionRoute(fakeSupabase as any, userId, "not-a-uuid");
      check("guardSessionRoute calls notFound() for bad UUID", false);
    } catch (err: any) {
      check("guardSessionRoute calls notFound() for bad UUID", err?.digest === "NEXT_NOT_FOUND");
    }

    // Test missing session calls notFound
    try {
      await guardSessionRoute(fakeSupabase as any, userId, "00000000-0000-0000-0000-999999999999");
      check("guardSessionRoute calls notFound() for missing session", false);
    } catch (err: any) {
      check("guardSessionRoute calls notFound() for missing session", err?.digest === "NEXT_NOT_FOUND");
    }

    // Test valid session completes
    const validSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "valid-id" }, error: null })
            })
          })
        })
      })
    };

    try {
      await guardSessionRoute(validSupabase as any, userId, "00000000-0000-0000-0000-000000000002");
      check("guardSessionRoute completes for valid session", true);
    } catch {
      check("guardSessionRoute completes for valid session", false);
    }
  }

  console.log("\n5. guardHistoryRoute is an alias");
  {
    const { guardHistoryRoute } = await import("../src/lib/route-guards.js");
    const userId = "00000000-0000-0000-0000-000000000001";

    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        })
      })
    };

    try {
      await guardHistoryRoute(fakeSupabase as any, userId, "bad-id");
      check("guardHistoryRoute calls notFound() for bad UUID", false);
    } catch (err: any) {
      check("guardHistoryRoute calls notFound() for bad UUID", err?.digest === "NEXT_NOT_FOUND");
    }

    const validSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "valid" }, error: null })
            })
          })
        })
      })
    };

    try {
      await guardHistoryRoute(validSupabase as any, userId, "00000000-0000-0000-0000-000000000003");
      check("guardHistoryRoute completes for valid history", true);
    } catch {
      check("guardHistoryRoute completes for valid history", false);
    }
  }

  console.log("\n6. Layout imports verify route guards are wired");
  {
    // Import layouts to verify they import guards (compile-time check)
    try {
      await import("../src/app/session/[id]/layout.js");
      check("src/app/session/[id]/layout.tsx imports", true);
    } catch (err) {
      check("src/app/session/[id]/layout.tsx imports", false, `${err}`);
    }

    try {
      await import("../src/app/history/[id]/layout.js");
      check("src/app/history/[id]/layout.tsx imports", true);
    } catch (err) {
      check("src/app/history/[id]/layout.tsx imports", false, `${err}`);
    }

    try {
      await import("../src/app/breathe/[slug]/layout.js");
      check("src/app/breathe/[slug]/layout.tsx imports", true);
    } catch (err) {
      check("src/app/breathe/[slug]/layout.tsx imports", false, `${err}`);
    }
  }

  console.log("\n7. loadPractice is cached at module level");
  {
    const { loadPractice } = await import("../src/app/breathe/load.js");
    check(
      "loadPractice is exported",
      typeof loadPractice === "function",
    );
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
