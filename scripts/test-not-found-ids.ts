/**
 * Test that invalid or nonexistent route parameters return 404, not 200.
 *
 * The bug (QA Bot 2): routes with loading.tsx were returning HTTP 200 for
 * nonexistent or malformed IDs because notFound() was called after streaming
 * started. The fix moves validation to layout.tsx, which runs OUTSIDE the
 * loading.tsx Suspense boundary.
 *
 *   npx tsx scripts/test-not-found-ids.ts
 */
import { isUuid } from "../src/lib/ids";
import { 
  checkSessionRoute, 
  checkBreatheRoute,
  guardSessionRoute,
  guardHistoryRoute,
} from "../src/lib/route-guards";
import type { SupabaseClient } from "@supabase/supabase-js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

function createFakeSessionClient(shouldExist: boolean, shouldThrow = false, hasError = false) {
  const eqCalls: Array<[string, string]> = [];
  return {
    from: () => {
      if (shouldThrow) {
        throw new Error("Unexpected query: .from() should not be called for malformed IDs");
      }
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            eqCalls.push([col, val]);
            return {
              eq: (col: string, val: string) => {
                eqCalls.push([col, val]);
                return {
                  maybeSingle: async () => ({
                    data: shouldExist ? { id: "550e8400-e29b-41d4-a716-446655440000" } : null,
                    error: hasError ? { code: "XX000", message: "Test error" } : null,
                  }),
                };
              },
            };
          },
        }),
      };
    },
    _eqCalls: eqCalls,
  };
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

  console.log("\n2. checkSessionRoute validates and queries");
  {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const existingClient = createFakeSessionClient(true) as unknown as SupabaseClient;
    const missingClient = createFakeSessionClient(false) as unknown as SupabaseClient;
    const noQueryClient = createFakeSessionClient(false, true) as unknown as SupabaseClient;
    const errorClient = createFakeSessionClient(false, false, true);
    
    check(
      "valid UUID that exists returns 'ok'",
      (await checkSessionRoute(existingClient, userId, "550e8400-e29b-41d4-a716-446655440000")) === "ok",
    );
    
    // Check that .eq() was called with correct parameters
    check(
      "queries filter by user_id",
      (existingClient as any)._eqCalls.some((call: [string, string]) => call[0] === "user_id" && call[1] === userId),
    );
    check(
      "queries filter by id",
      (existingClient as any)._eqCalls.some((call: [string, string]) => call[0] === "id" && call[1] === "550e8400-e29b-41d4-a716-446655440000"),
    );
    
    check(
      "valid UUID that doesn't exist returns 'not_found'",
      (await checkSessionRoute(missingClient, userId, "c56a4180-65aa-42ec-a945-5fd21dec0538")) === "not_found",
    );
    
    // Test error rejection
    let errorThrown = false;
    try {
      await checkSessionRoute(errorClient as unknown as SupabaseClient, userId, "550e8400-e29b-41d4-a716-446655440000");
    } catch {
      errorThrown = true;
    }
    check("checkSessionRoute throws when maybeSingle returns error", errorThrown);
  }

  console.log("\n3. checkHistoryRoute is an alias for checkSessionRoute");
  {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const existingClient = createFakeSessionClient(true) as unknown as SupabaseClient;
    const missingClient = createFakeSessionClient(false) as unknown as SupabaseClient;
    const noQueryClient = createFakeSessionClient(false, true) as unknown as SupabaseClient;
    
    check(
      "valid UUID that exists returns 'ok'",
      (await guardHistoryRoute(existingClient, userId, "550e8400-e29b-41d4-a716-446655440000")) === undefined,
    );
    
    check(
      "malformed ID returns 'not_found' without query",
      (await checkSessionRoute(noQueryClient, userId, "not-a-uuid")) === "not_found",
    );
  }

  console.log("\n4. checkBreatheRoute validates slugs with injected loader");
  {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const fakeSupabase = {} as unknown as SupabaseClient;
    
    type FakeLoadedPractice = { 
      pattern: { kind: string; id: string; slug?: string; userPatternId?: string }; 
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
      (await checkBreatheRoute(fakeSupabase, userId, "coherent", builtinLoader as unknown as typeof import("../src/app/breathe/load").loadPractice)) === "ok",
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
      (await checkBreatheRoute(fakeSupabase, userId, `mine-${userId}`, ownedLoader as unknown as typeof import("../src/app/breathe/load").loadPractice)) === "ok",
    );
    
    // Pattern owned by someone else or missing
    const notOwnedLoader = async (): Promise<null> => null;
    check(
      "custom pattern owned by someone else returns 'not_found'",
      (await checkBreatheRoute(fakeSupabase, userId, "mine-other-uuid", notOwnedLoader as unknown as typeof import("../src/app/breathe/load").loadPractice)) === "not_found",
    );
    
    // Retimed builtin (has userPatternId from findPatternByLogKey)
    const retimedLoader = async (): Promise<FakeLoadedPractice> => ({ 
      pattern: { 
        kind: "builtin", 
        id: "2", 
        slug: "box",
        userPatternId: "user-retimed-id"
      }, 
      prefs: {}, 
      lastCycles: null, 
      firstPractice: false 
    });
    check(
      "retimed builtin pattern returns 'ok'",
      (await checkBreatheRoute(fakeSupabase, userId, "box", retimedLoader as unknown as typeof import("../src/app/breathe/load").loadPractice)) === "ok",
    );
    
    // Invalid slug
    const junkLoader = async (): Promise<null> => null;
    check(
      "invalid slug returns 'not_found'",
      (await checkBreatheRoute(fakeSupabase, userId, "junk-slug", junkLoader as unknown as typeof import("../src/app/breathe/load").loadPractice)) === "not_found",
    );
  }

  console.log("\n5. Edge cases that should fail validation");
  {
    check("UUID with uppercase and invalid char", !isUuid("C56A4180-65AA-42EC-A945-5FD21DEC053Z"));
    check("UUID with spaces", !isUuid("550e8400 e29b 41d4 a716 446655440000"));
    check("UUID-like but wrong segments", !isUuid("550e8400-e29-b41d4-a716-446655440000"));
    check("All zeros is valid", isUuid("00000000-0000-0000-0000-000000000000"));
    check("All Fs is valid", isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff"));
  }

  console.log("\n6. guardSessionRoute throws notFound() for invalid input");
  {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const missingClient = createFakeSessionClient(false) as unknown as SupabaseClient;
    const existingClient = createFakeSessionClient(true) as unknown as SupabaseClient;

    // Test that it throws for bad UUID
    try {
      await guardSessionRoute(missingClient, userId, "not-a-uuid");
      check("guardSessionRoute throws for bad UUID", false, "did not throw");
    } catch (err: unknown) {
      const digest = (err as { digest?: string }).digest;
      check("guardSessionRoute throws for bad UUID", digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    }

    // Test that it throws for missing session
    try {
      await guardSessionRoute(missingClient, userId, "550e8400-e29b-41d4-a716-446655440000");
      check("guardSessionRoute throws for missing session", false, "did not throw");
    } catch (err: unknown) {
      const digest = (err as { digest?: string }).digest;
      check("guardSessionRoute throws for missing session", digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    }

    // Test that it returns children for valid session
    try {
      const result = await guardSessionRoute(existingClient, userId, "550e8400-e29b-41d4-a716-446655440000");
      check("guardSessionRoute completes for valid session", result === undefined);
    } catch (err: unknown) {
      check("guardSessionRoute completes for valid session", false, `threw: ${err}`);
    }
  }

  console.log("\n7. guardHistoryRoute is an alias");
  {
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const missingClient = createFakeSessionClient(false) as unknown as SupabaseClient;
    const existingClient = createFakeSessionClient(true) as unknown as SupabaseClient;

    // Test that it throws for bad UUID
    try {
      await guardHistoryRoute(missingClient, userId, "not-a-uuid");
      check("guardHistoryRoute throws for bad UUID", false, "did not throw");
    } catch (err: unknown) {
      const digest = (err as { digest?: string }).digest;
      check("guardHistoryRoute throws for bad UUID", digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    }

    // Test that it returns for valid history
    try {
      const result = await guardHistoryRoute(existingClient, userId, "550e8400-e29b-41d4-a716-446655440000");
      check("guardHistoryRoute completes for valid history", result === undefined);
    } catch (err: unknown) {
      check("guardHistoryRoute completes for valid history", false, `threw: ${err}`);
    }
  }

  console.log("\n8. Layout structure prevents streaming before guard runs");
  {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const layoutPaths = [
      "src/app/session/[id]/layout.tsx",
      "src/app/history/[id]/layout.tsx",
      "src/app/breathe/[slug]/layout.tsx",
    ];
    
    for (const layoutPath of layoutPaths) {
      const dir = path.dirname(layoutPath);
      const segments = dir.split(path.sep).filter(Boolean);
      
      let foundLoading = false;
      // Check each ancestor directory (excluding the layout's own directory)
      for (let i = 1; i < segments.length - 1; i++) {
        const ancestorPath = segments.slice(0, i + 1).join(path.sep);
        const loadingPath = path.join(ancestorPath, "loading.tsx");
        
        try {
          await fs.access(loadingPath);
          check(
            `No ancestor loading.tsx for ${layoutPath}`,
            false,
            `found ${loadingPath} which would wrap the layout`,
          );
          foundLoading = true;
          break;
        } catch {
          // File doesn't exist, which is what we want
        }
      }
      
      if (!foundLoading) {
        check(`No ancestor loading.tsx wraps ${layoutPath}`, true);
      }
    }
  }

  console.log("\n9. Not-found pages render exactly one nav");
  {
    const fs = await import("fs/promises");
    
    const notFoundPaths = [
      "src/app/not-found.tsx",
      "src/app/session/not-found.tsx",
    ];
    
    for (const nfPath of notFoundPaths) {
      try {
        const content = await fs.readFile(nfPath, "utf-8");
        const navCount = (content.match(/<BottomNav/g) || []).length;
        check(
          `${nfPath} doesn't render BottomNav`,
          navCount === 0,
          navCount > 0 ? `found ${navCount} BottomNav renders, should rely on root layout` : "",
        );
      } catch (err) {
        check(`${nfPath} exists`, false, `${err}`);
      }
    }
    
    // Check that root layout renders exactly one BottomNav
    try {
      const layoutContent = await fs.readFile("src/app/layout.tsx", "utf-8");
      const navCount = (layoutContent.match(/<BottomNav/g) || []).length;
      check(
        "Root layout renders exactly one BottomNav",
        navCount === 1,
        navCount !== 1 ? `found ${navCount}` : "",
      );
    } catch (err) {
      check("Root layout exists", false, `${err}`);
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
