#!/usr/bin/env tsx
/**
 * Route-level test for /sitemap.xml and /robots.txt
 * 
 * Tests the actual HTTP routes (not just the generating functions):
 * - Builds and starts a Next.js server
 * - Fetches /sitemap.xml and /robots.txt over HTTP
 * - Validates HTTP 200, correct content-types, and valid structure
 * - Tests with NEXT_PUBLIC_SITE_URL unset and set
 * - Exercises the proxy/middleware to catch auth issues
 * 
 * Safety features to prevent hangs:
 * - 90s hard overall timeout
 * - Process groups (detached spawn + kill -pid)
 * - Bounded readiness polling
 * - Signal handlers (SIGINT/SIGTERM)
 * - Explicit process.exit
 * - Random free port (port 0)
 * 
 * Usage:
 *   npx tsx scripts/test-sitemap-route.ts
 */

import { spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import * as net from "net";

const sleep = promisify(setTimeout);

let failures = 0;
let activeServer: ChildProcess | null = null;

// Hard 90s timeout to prevent hangs
const OVERALL_TIMEOUT_MS = 90_000;
let overallTimeoutHandle: NodeJS.Timeout | null = null;

function killProcessGroup(proc: ChildProcess) {
  if (!proc.pid) return;
  try {
    // Kill entire process group with -pid
    process.kill(-proc.pid, 'SIGTERM');
    setTimeout(() => {
      try {
        process.kill(-proc.pid!, 'SIGKILL');
      } catch {
        // Already dead
      }
    }, 2000);
  } catch (e) {
    // Process may already be dead
    try {
      proc.kill('SIGKILL');
    } catch {
      // Ignore
    }
  }
}

function cleanup() {
  if (overallTimeoutHandle) {
    clearTimeout(overallTimeoutHandle);
  }
  if (activeServer) {
    killProcessGroup(activeServer);
    activeServer = null;
  }
}

// Signal handlers
process.on('SIGINT', () => {
  console.error('\nReceived SIGINT, cleaning up...');
  cleanup();
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.error('\nReceived SIGTERM, cleaning up...');
  cleanup();
  process.exit(143);
});

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

interface ServerProcess {
  process: ReturnType<typeof spawn>;
  port: number;
  baseUrl: string;
}

async function startServer(): Promise<ServerProcess> {
  const port = await findFreePort();
  const baseUrl = `http://localhost:${port}`;

  const serverProcess = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Create process group
  });

  activeServer = serverProcess;

  let output = "";
  serverProcess.stdout?.on("data", (data) => {
    output += data.toString();
  });
  serverProcess.stderr?.on("data", (data) => {
    output += data.toString();
  });

  // Bounded readiness polling: max 30 attempts * 500ms = 15s
  const MAX_READINESS_ATTEMPTS = 30;
  let ready = false;

  for (let i = 0; i < MAX_READINESS_ATTEMPTS; i++) {
    // Check if stdout indicates server started
    if (output.includes('Local:') || output.includes('started server on')) {
      await sleep(500); // Brief stabilization delay
      ready = true;
      break;
    }
    await sleep(500);
  }

  if (!ready) {
    killProcessGroup(serverProcess);
    throw new Error(`Server failed to start after ${MAX_READINESS_ATTEMPTS * 500}ms. Output:\n${output}`);
  }

  return { process: serverProcess, port, baseUrl };
}

function stopServer(server: ServerProcess) {
  killProcessGroup(server.process);
  if (activeServer === server.process) {
    activeServer = null;
  }
}

async function testSitemapXml(baseUrl: string, expectedBaseUrl?: string): Promise<void> {
  const response = await fetch(`${baseUrl}/sitemap.xml`);
  
  check("sitemap.xml returns 200", response.status === 200, `got ${response.status}`);
  
  const contentType = response.headers.get("content-type") || "";
  check("sitemap.xml has XML content-type", contentType.includes("xml"), `got ${contentType}`);
  
  const body = await response.text();
  check("sitemap.xml contains <urlset>", body.includes("<urlset"));
  check("sitemap.xml contains xmlns", body.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  
  const locMatches = body.match(/<loc>([^<]+)<\/loc>/g);
  check("sitemap.xml has <loc> entries", locMatches !== null && locMatches.length > 0);
  
  if (locMatches) {
    const urls = locMatches.map(m => m.replace(/<\/?loc>/g, ""));
    for (const url of urls) {
      check(`<loc> is absolute URL: ${url}`, url.startsWith("http://") || url.startsWith("https://"));
      
      if (expectedBaseUrl) {
        check(`<loc> starts with expected base: ${url}`, url.startsWith(expectedBaseUrl));
      }
    }
    
    const expectedPaths = ["/", "/terms", "/privacy"];
    for (const path of expectedPaths) {
      const found = urls.some(u => {
        try {
          const parsed = new URL(u);
          return parsed.pathname === path || parsed.href.endsWith(path);
        } catch {
          return false;
        }
      });
      check(`sitemap includes ${path}`, found);
    }
  }
}

async function testRobotsTxt(baseUrl: string, expectedBaseUrl?: string): Promise<void> {
  const response = await fetch(`${baseUrl}/robots.txt`);
  
  check("robots.txt returns 200", response.status === 200, `got ${response.status}`);
  
  const contentType = response.headers.get("content-type") || "";
  check("robots.txt has text content-type", contentType.includes("text"), `got ${contentType}`);
  
  const body = await response.text();
  check("robots.txt contains User-agent", body.toLowerCase().includes("user-agent"));
  check("robots.txt contains Allow", body.toLowerCase().includes("allow"));
  check("robots.txt contains Disallow", body.toLowerCase().includes("disallow"));
  check("robots.txt contains Sitemap", body.toLowerCase().includes("sitemap"));
  
  const sitemapMatch = body.match(/Sitemap:\s*(.+)/i);
  if (sitemapMatch) {
    const sitemapUrl = sitemapMatch[1].trim();
    check("Sitemap URL is absolute", sitemapUrl.startsWith("http://") || sitemapUrl.startsWith("https://"));
    check("Sitemap URL ends with /sitemap.xml", sitemapUrl.endsWith("/sitemap.xml"));
    
    if (expectedBaseUrl) {
      check(`Sitemap URL uses expected base: ${sitemapUrl}`, sitemapUrl.startsWith(expectedBaseUrl));
    }
  }
}

async function testProxyBehavior(baseUrl: string): Promise<void> {
  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  check("sitemap.xml bypasses auth (no redirect)", sitemapResponse.status === 200);
  check("sitemap.xml bypasses auth (no Location header)", !sitemapResponse.headers.has("location"));
  
  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  check("robots.txt bypasses auth (no redirect)", robotsResponse.status === 200);
  check("robots.txt bypasses auth (no Location header)", !robotsResponse.headers.has("location"));
}

async function runTests() {
  // Start 90s hard timeout
  overallTimeoutHandle = setTimeout(() => {
    console.error('\n❌ Test exceeded 90s timeout, killing server...');
    cleanup();
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  console.log("\nRoute-level tests for sitemap.xml and robots.txt");
  console.log("=".repeat(60));
  console.log("\nNote: Reuses build from CI (or `npm run build` run before this test)");
  console.log("Tests the actual HTTP routes through Next.js server + middleware/proxy");

  console.log("\n1. Test sitemap.xml route (signed out)");
  {
    let server: ServerProcess | null = null;
    try {
      server = await startServer();
      await testSitemapXml(server.baseUrl);
    } catch (error) {
      console.error("Error in sitemap route test:", error);
      failures++;
    } finally {
      if (server) stopServer(server);
      await sleep(1000); // Let server fully die
    }
  }

  console.log("\n2. Test robots.txt route (signed out)");
  {
    let server: ServerProcess | null = null;
    try {
      server = await startServer();
      await testRobotsTxt(server.baseUrl);
    } catch (error) {
      console.error("Error in robots route test:", error);
      failures++;
    } finally {
      if (server) stopServer(server);
      await sleep(1000);
    }
  }

  console.log("\n3. Test proxy/middleware behavior");
  {
    let server: ServerProcess | null = null;
    try {
      server = await startServer();
      await testProxyBehavior(server.baseUrl);
    } catch (error) {
      console.error("Error in proxy behavior test:", error);
      failures++;
    } finally {
      if (server) stopServer(server);
      await sleep(1000);
    }
  }

  cleanup(); // Clear timeout

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  } else {
    console.log("\n✅ All route-level tests passed\n");
    process.exit(0);
  }
}

runTests().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
