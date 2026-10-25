/**
 * Behavioral test: Service worker built output.
 *
 * Tests that the BUILT service worker (after `next build`) correctly
 * cleans up old caches and calls clients.claim().
 *
 * This catches production minification issues that source tests miss,
 * such as when cachesToDelete.toString() is minified but the call site isn't.
 *
 * This test FAILS on fb0db31d because the built /sw.js has:
 *   function s(e,t,a){...}  // minified cachesToDelete
 *   const toDelete = cachesToDelete(...)  // call to undefined function
 */

import { spawn } from "child_process";
import { once } from "events";

console.log("Testing Service Worker Built Output");
console.log("===================================\n");

async function runTests() {
  console.log("▶ Testing built SW activate handler...");

  // Start Next.js production server on a free port
  const port = 31337;
  console.log(`  Starting Next.js server on port ${port}...`);

  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  let serverOutput = "";
  server.stdout?.on("data", (data) => {
    serverOutput += data.toString();
  });
  server.stderr?.on("data", (data) => {
    serverOutput += data.toString();
  });

  // Wait for server to be ready
  let ready = false;
  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server failed to start within 15s.\nOutput: ${serverOutput}`));
    }, 15000);

    server.stdout?.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Ready") || output.includes("started server")) {
        ready = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    server.on("exit", (code) => {
      if (!ready) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}.\nOutput: ${serverOutput}`));
      }
    });
  });

  try {
    await readyPromise;
    console.log("  ✓ Server started successfully");

    // Fetch /sw.js from the running server
    const response = await fetch(`http://localhost:${port}/sw.js`);
    if (!response.ok) {
      throw new Error(`Failed to fetch /sw.js: ${response.status} ${response.statusText}`);
    }
    const scriptText = await response.text();
    console.log("  ✓ Fetched /sw.js from production server");

  // Verify the script contains the function definition
  if (!scriptText.includes("function cachesToDelete")) {
    throw new Error(
      "Built SW script does not include 'function cachesToDelete'.\n" +
      "The CACHES_TO_DELETE_JS constant may not be embedded correctly."
    );
  }

  console.log("  ✓ Built SW script includes cachesToDelete function");

  // Extract CACHE_NAME from the script
  const cacheNameMatch = scriptText.match(/const CACHE_NAME = "([^"]+)"/);
  if (!cacheNameMatch) {
    throw new Error("Could not extract CACHE_NAME from built SW script");
  }
  const currentCache = cacheNameMatch[1];
  
  // Derive brand prefix from CACHE_NAME
  const brandMatch = currentCache.match(/^(.+-offline-)/);
  if (!brandMatch) {
    throw new Error("CACHE_NAME doesn't match expected pattern");
  }
  const brandPrefix = brandMatch[1];

  console.log(`  ✓ Extracted CACHE_NAME: ${currentCache}`);
  console.log(`  ✓ Extracted brand prefix: ${brandPrefix}`);

  // Create fake SW globals
  const deletedCaches: string[] = [];
  const allCaches = [
    `${brandPrefix}v1`,
    `${brandPrefix}old2`,
    currentCache,
    "fitcore-offline-v1",
    "other-cache",
  ];

  type ActivateHandler = (event: { waitUntil: (p: Promise<void>) => void }) => void;
  let activateHandler: ActivateHandler | null = null;
  let claimCalled = false;

  const fakeGlobal = {
    caches: {
      keys: async () => allCaches,
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
      open: async () => ({}),
    },
    clients: {
      claim: async () => {
        claimCalled = true;
      },
    },
    addEventListener: (
      _event: string,
      handler: ActivateHandler
    ) => {
      if (_event === "activate") {
        activateHandler = handler;
      }
    },
    skipWaiting: async () => undefined,
    location: { origin: "http://localhost:3000" },
  };

  // Execute the built script in fake SW global to register handlers
  const wrappedScript = new Function(
    "self",
    "caches",
    "clients",
    scriptText
  );

  wrappedScript.call(
    fakeGlobal,
    fakeGlobal,
    fakeGlobal.caches,
    fakeGlobal.clients
  );

  if (!activateHandler) {
    throw new Error("Built SW did not register an activate handler");
  }

  console.log("  ✓ Built SW registered activate handler");

  // Trigger activate event and wait for completion
  const activatePromise = await (function invokeActivateHandler(
    handler: ActivateHandler
  ): Promise<Promise<void>> {
    return new Promise((resolve) => {
      handler({
        waitUntil: (p: Promise<void>) => {
          resolve(p);
        },
      });
    });
  })(activateHandler);

  let activateError: Error | null = null;
  try {
    await activatePromise;
    console.log("  ✓ Activate handler resolved successfully");
  } catch (error) {
    activateError = error instanceof Error ? error : new Error(String(error));
    console.log(`  ✗ Activate handler rejected: ${activateError.message}`);
  }

  // Verify deleted caches
  const expectedDeleted = [`${brandPrefix}v1`, `${brandPrefix}old2`];
  const deletedSorted = [...deletedCaches].sort();
  const expectedSorted = [...expectedDeleted].sort();

  if (deletedSorted.length !== expectedSorted.length ||
      !deletedSorted.every((val, idx) => val === expectedSorted[idx])) {
    throw new Error(
      `Built SW did not delete correct caches.\n` +
      `Expected: ${JSON.stringify(expectedSorted)}\n` +
      `Got: ${JSON.stringify(deletedSorted)}\n` +
      (activateError ? `Activate error: ${activateError.message}` : "")
    );
  }

  console.log(`  ✓ Built SW deleted old caches: ${expectedDeleted.join(", ")}`);
  console.log(`  ✓ Built SW kept current cache: ${currentCache}`);
  console.log("  ✓ Built SW kept other brand caches: fitcore-offline-v1");
  console.log("  ✓ Built SW kept other caches: other-cache");

  // Verify clients.claim() was called
  if (!claimCalled) {
    throw new Error(
      "Built SW did not call clients.claim().\n" +
      "This means new clients won't be controlled until the next navigation."
    );
  }

  console.log("  ✓ Built SW called clients.claim()");

  console.log("\n✅ All built SW output tests passed\n");
  } finally {
    // Stop the server
    server.kill("SIGTERM");
    // Give it a moment to shut down gracefully
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
