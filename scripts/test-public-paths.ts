/**
 * Tests the public path matching logic from the session proxy.
 *
 * Ensures that:
 * - Intended public paths are accessible without a session
 * - Protected paths remain protected
 * - Prefix matching doesn't accidentally expose unintended routes
 *
 *   npm run test:public-paths
 */

/** Routes reachable without a session. Everything else redirects to "/". */
const PUBLIC_PATHS = ["/", "/auth", "/legal", "/privacy", "/terms"];

/** Dev-only harnesses. */
const DEV_PATHS: string[] = [];

/** Probe paths (empty when PERF_TOKEN is not set). */
const PROBE_PATHS: string[] = [];

/**
 * Simulates the isPublic check from session.ts
 */
function isPublicPath(pathname: string): boolean {
  return [...PUBLIC_PATHS, ...DEV_PATHS, ...PROBE_PATHS].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Exact public paths should be accessible");
{
  check("/", isPublicPath("/"));
  check("/auth", isPublicPath("/auth"));
  check("/legal", isPublicPath("/legal"));
  check("/privacy", isPublicPath("/privacy"));
  check("/terms", isPublicPath("/terms"));
}

console.log("\n2. Public path subpaths should be accessible");
{
  check("/auth/callback", isPublicPath("/auth/callback"));
  check("/auth/confirm", isPublicPath("/auth/confirm"));
  check("/legal/something", isPublicPath("/legal/something"));
  check("/privacy/subpage", isPublicPath("/privacy/subpage"));
  check("/terms/subpage", isPublicPath("/terms/subpage"));
}

console.log("\n3. Protected paths should NOT be accessible");
{
  check("/today should be protected", !isPublicPath("/today"));
  check("/settings should be protected", !isPublicPath("/settings"));
  check("/profile should be protected", !isPublicPath("/profile"));
  check("/api should be protected", !isPublicPath("/api"));
  check("/admin should be protected", !isPublicPath("/admin"));
}

console.log("\n4. Prefix matching should NOT expose similar-looking paths");
{
  check("/privacyfoo should be protected", !isPublicPath("/privacyfoo"));
  check("/privacy-anything should be protected", !isPublicPath("/privacy-anything"));
  check("/termsXYZ should be protected", !isPublicPath("/termsXYZ"));
  check("/terms-and-conditions should be protected", !isPublicPath("/terms-and-conditions"));
  check("/authenticate should be protected", !isPublicPath("/authenticate"));
  check("/authorization should be protected", !isPublicPath("/authorization"));
  check("/legalese should be protected", !isPublicPath("/legalese"));
  check("/today should be protected", !isPublicPath("/today"));
}

console.log("\n5. Edge cases");
{
  check("/privacy/ with trailing slash", isPublicPath("/privacy/"));
  check("/terms/ with trailing slash", isPublicPath("/terms/"));
  check("/auth/ with trailing slash", isPublicPath("/auth/"));
  check("// should be public (root)", isPublicPath("//"));
  check("/PRIVACY uppercase should be protected", !isPublicPath("/PRIVACY"));
  check("/Terms mixed case should be protected", !isPublicPath("/Terms"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
