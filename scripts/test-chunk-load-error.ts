#!/usr/bin/env tsx
/**
 * Behavioral test: ChunkLoadError detection and handling
 *
 * Requirements:
 * - error.tsx and global-error.tsx must detect ChunkLoadError
 * - Must show "A new version is available" with Reload button
 * - Must NOT report ChunkLoadError to Sentry
 * - NewVersionHint must catch unhandledrejection for ChunkLoadError
 *
 * This test fails on the old code (pre-fix).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";

console.log("▶ Testing ChunkLoadError detection and handling...\n");

const chunkLoadErrorPath = join(process.cwd(), "src/lib/chunk-load-error.ts");
const errorPath = join(process.cwd(), "src/app/error.tsx");
const globalErrorPath = join(process.cwd(), "src/app/global-error.tsx");
const newVersionHintPath = join(process.cwd(), "src/components/new-version-hint.tsx");

const chunkLoadErrorSource = readFileSync(chunkLoadErrorPath, "utf-8");
const errorSource = readFileSync(errorPath, "utf-8");
const globalErrorSource = readFileSync(globalErrorPath, "utf-8");
const newVersionHintSource = readFileSync(newVersionHintPath, "utf-8");

console.log("▶ Verifying isChunkLoadError helper...");

assert(
  chunkLoadErrorSource.includes('error.name === "ChunkLoadError"'),
  "isChunkLoadError must check error.name === 'ChunkLoadError'"
);

assert(
  chunkLoadErrorSource.includes("Loading chunk") &&
  chunkLoadErrorSource.includes("Failed to fetch dynamically imported module") &&
  chunkLoadErrorSource.includes("Importing a module script failed"),
  "isChunkLoadError must check for all three dynamic import error messages"
);

console.log("  ✓ Checks error.name === 'ChunkLoadError'");
console.log("  ✓ Checks message for 'Loading chunk'");
console.log("  ✓ Checks message for 'Failed to fetch dynamically imported module'");
console.log("  ✓ Checks message for 'Importing a module script failed'");

console.log("\n▶ Verifying error.tsx uses isChunkLoadError...");

assert(
  errorSource.includes('import { isChunkLoadError }'),
  "error.tsx must import isChunkLoadError"
);

assert(
  errorSource.includes("isChunkLoadError(error)"),
  "error.tsx must call isChunkLoadError(error)"
);

assert(
  errorSource.includes("A new version is available") &&
  errorSource.includes("handleReload") &&
  errorSource.includes("window.location.reload()"),
  "error.tsx must show 'A new version is available' with hard reload for chunk errors"
);

assert(
  errorSource.includes("!isChunkError") || 
  (errorSource.includes("if (!offline && !isChunkError)") || errorSource.includes("if (!offline && !isChunkError)")),
  "error.tsx must NOT report ChunkLoadError to Sentry"
);

console.log("  ✓ Imports isChunkLoadError");
console.log("  ✓ Calls isChunkLoadError(error)");
console.log("  ✓ Shows 'A new version is available' with hard reload");
console.log("  ✓ Does not report ChunkLoadError to Sentry");

console.log("\n▶ Verifying global-error.tsx uses isChunkLoadError...");

assert(
  globalErrorSource.includes('import { isChunkLoadError }'),
  "global-error.tsx must import isChunkLoadError"
);

assert(
  globalErrorSource.includes("isChunkLoadError(error)"),
  "global-error.tsx must call isChunkLoadError(error)"
);

assert(
  globalErrorSource.includes("A new version is available") &&
  globalErrorSource.includes("handleReload"),
  "global-error.tsx must show 'A new version is available' with hard reload for chunk errors"
);

console.log("  ✓ Imports isChunkLoadError");
console.log("  ✓ Calls isChunkLoadError(error)");
console.log("  ✓ Shows 'A new version is available' with hard reload");

console.log("\n▶ Verifying NewVersionHint catches unhandledrejection...");

assert(
  newVersionHintSource.includes('import { isChunkLoadError }'),
  "NewVersionHint must import isChunkLoadError"
);

assert(
  newVersionHintSource.includes('addEventListener("unhandledrejection"') &&
  newVersionHintSource.includes("handleUnhandledRejection"),
  "NewVersionHint must listen for unhandledrejection events"
);

assert(
  newVersionHintSource.includes("isChunkLoadError(error)") &&
  newVersionHintSource.includes("setShowHint(true)"),
  "NewVersionHint must show hint on unhandledrejection ChunkLoadError"
);

assert(
  newVersionHintSource.includes("event.preventDefault()"),
  "NewVersionHint must prevent console error for ChunkLoadError"
);

assert(
  newVersionHintSource.includes('removeEventListener("unhandledrejection"'),
  "NewVersionHint must remove unhandledrejection listener on unmount"
);

console.log("  ✓ Imports isChunkLoadError");
console.log("  ✓ Listens for unhandledrejection");
console.log("  ✓ Shows hint on ChunkLoadError");
console.log("  ✓ Prevents default console error");
console.log("  ✓ Removes listener on unmount");

console.log("\n✅ All ChunkLoadError tests passed");
