/**
 * Inject the build ID into the service worker.
 *
 * Reads public/sw.js, replaces __BUILD_ID__ with the Next.js build ID
 * or Vercel commit SHA, and writes the result to .next/static/sw.js.
 *
 * Run as part of the build process (after `next build` completes).
 */

import * as fs from "fs";
import * as path from "path";

function getBuildId(): string {
  // Try Vercel environment first (commit SHA from Git)
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }

  // Try reading Next.js build ID from .next/BUILD_ID
  const buildIdPath = path.join(__dirname, "..", ".next", "BUILD_ID");
  if (fs.existsSync(buildIdPath)) {
    const buildId = fs.readFileSync(buildIdPath, "utf-8").trim();
    if (buildId) {
      return buildId;
    }
  }

  // Fallback: use timestamp for local dev builds
  return `dev-${Date.now()}`;
}

function main() {
  const buildId = getBuildId();
  console.log(`[inject-build-id] Build ID: ${buildId}`);

  const swSourcePath = path.join(__dirname, "..", "public", "sw.js");
  const swSource = fs.readFileSync(swSourcePath, "utf-8");

  const injected = swSource.replace(/__BUILD_ID__/g, buildId);

  // Write the injected version back to public/sw.js for deployment
  fs.writeFileSync(swSourcePath, injected, "utf-8");

  console.log(`[inject-build-id] Injected build ID into public/sw.js`);
}

main();
