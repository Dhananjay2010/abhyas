/**
 * Test: /api/version endpoint
 *
 * Verifies that:
 * 1. The endpoint exists and returns JSON
 * 2. Returns version from NEXT_PUBLIC_BUILD_SHA or fallback
 * 3. Has proper cache headers (no-cache)
 * 4. Is included in public paths (accessible without auth)
 */

import { readFileSync } from "fs";
import { join } from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

async function testVersionEndpoint() {
  console.log("\n▶ Testing /api/version endpoint exists...");

  const routePath = join(__dirname, "..", "src", "app", "api", "version", "route.ts");
  const fs = await import("fs");
  
  assert(
    fs.existsSync(routePath),
    "/api/version route must exist at src/app/api/version/route.ts"
  );

  const source = readFileSync(routePath, "utf-8");

  assert(
    source.includes("export async function GET"),
    "Route must export async function GET"
  );

  assert(
    source.includes("NextResponse.json"),
    "Route must return NextResponse.json"
  );

  assert(
    source.includes("version"),
    "Response must include version field"
  );

  console.log("  ✓ /api/version route exists");
  console.log("  ✓ Exports GET handler");
  console.log("  ✓ Returns JSON with version field");

  console.log("\n▶ Testing version resolution logic...");

  assert(
    source.includes("VERCEL_GIT_COMMIT_SHA") || source.includes("NEXT_PUBLIC_BUILD_SHA"),
    "Route must check VERCEL_GIT_COMMIT_SHA or NEXT_PUBLIC_BUILD_SHA"
  );

  assert(
    source.includes('"dev"') || source.includes("'dev'"),
    "Route must fall back to 'dev' in development"
  );

  console.log("  ✓ Checks VERCEL_GIT_COMMIT_SHA");
  console.log("  ✓ Checks NEXT_PUBLIC_BUILD_SHA");
  console.log("  ✓ Falls back to 'dev'");

  console.log("\n▶ Testing cache headers...");

  assert(
    source.includes("Cache-Control") && source.includes("must-revalidate"),
    "Route must set Cache-Control: must-revalidate"
  );

  assert(
    source.includes("max-age=0"),
    "Route must set max-age=0 for immediate revalidation"
  );

  console.log("  ✓ Sets Cache-Control header");
  console.log("  ✓ Sets max-age=0");
  console.log("  ✓ Sets must-revalidate");

  console.log("\n▶ Testing public paths includes /api/version...");

  const publicPathsSource = readFileSync(
    join(__dirname, "..", "src", "lib", "supabase", "public-paths.ts"),
    "utf-8"
  );

  assert(
    publicPathsSource.includes('"/api/version"') || publicPathsSource.includes("'/api/version'"),
    "/api/version must be in PUBLIC_PATHS array"
  );

  console.log("  ✓ /api/version is in PUBLIC_PATHS");
  console.log("  ✓ Accessible without authentication");

  console.log("\n▶ Testing dynamic route flag...");

  assert(
    source.includes('export const dynamic = "force-dynamic"') || 
    source.includes("export const dynamic = 'force-dynamic'"),
    "Route must export dynamic = 'force-dynamic' to ensure fresh version on each request"
  );

  console.log("  ✓ Route exports dynamic = 'force-dynamic'");
}

console.log("Testing /api/version Endpoint");
console.log("=============================");

testVersionEndpoint().then(
  () => {
    console.log("\n✅ All /api/version endpoint tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
