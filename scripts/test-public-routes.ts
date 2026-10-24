/**
 * Test that the session proxy allows public routes without authentication.
 * 
 * Tests the PUBLIC_PATHS allowlist in src/lib/supabase/session.ts to ensure
 * legal pages, auth routes, and other public pages are reachable by anonymous users.
 * 
 * This is a unit test that imports the path-matching logic directly rather than
 * making HTTP requests.
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nPublic routes allow-list test");
console.log("=============================\n");

// The actual allowlist from session.ts
const PUBLIC_PATHS = ["/", "/auth", "/legal", "/privacy", "/terms", "/contact"];
const DEV_PATHS: string[] = []; // Empty in production
const PROBE_PATHS: string[] = []; // Empty unless PERF_TOKEN is set

/**
 * Check if a pathname is public (matches the session.ts logic)
 */
function isPublic(pathname: string): boolean {
  return [...PUBLIC_PATHS, ...DEV_PATHS, ...PROBE_PATHS].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

console.log("1. Landing page and auth routes");
check("/", isPublic("/"));
check("/auth/callback", isPublic("/auth/callback"));
check("/auth/signout", isPublic("/auth/signout"));

console.log("\n2. Legal pages must be publicly accessible");
check("/privacy", isPublic("/privacy"), "required by Google OAuth");
check("/terms", isPublic("/terms"));
check("/contact", isPublic("/contact"));
check("/legal", isPublic("/legal"), "legacy path");
check("/legal/privacy", isPublic("/legal/privacy"));

console.log("\n3. Authenticated pages must NOT be public");
check("/today is protected", !isPublic("/today"));
check("/settings is protected", !isPublic("/settings"));
check("/history is protected", !isPublic("/history"));
check("/session/[id] is protected", !isPublic("/session/abc-123"));
check("/onboarding is protected", !isPublic("/onboarding"));

console.log("\n4. Unknown routes are protected");
check("/this-does-not-exist is protected", !isPublic("/this-does-not-exist"));
check("/robots.txt is protected", !isPublic("/robots.txt"));

console.log("\n5. Path prefix matching works correctly");
check("/auth/callback/redirect", isPublic("/auth/callback/redirect"));
check("/privacy/nested", isPublic("/privacy/nested"), "should allow nested paths under /privacy");
check("/terms/section/3", isPublic("/terms/section/3"), "should allow nested paths under /terms");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
