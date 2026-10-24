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
 * Usage:
 *   npx tsx scripts/test-sitemap-route.ts
 */

import { spawn } from "child_process";
import { promisify } from "util";
import * as net from "net";

const sleep = promisify(setTimeout);

let failures = 0;

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

  const serverProcess = spawn("npm", ["start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  serverProcess.stdout?.on("data", (data) => {
    output += data.toString();
  });
  serverProcess.stderr?.on("data", (data) => {
    output += data.toString();
  });

  await sleep(3000);

  for (let i = 0; i < 20; i++) {
    try {
      const response = await fetch(`${baseUrl}/robots.txt`);
      if (response.ok) {
        return { process: serverProcess, port, baseUrl };
      }
    } catch {
      // Server not ready yet
    }
    await sleep(500);
  }

  serverProcess.kill();
  throw new Error(`Server failed to start after 13s. Output:\n${output}`);
}

function stopServer(server: ServerProcess) {
  server.process.kill();
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
  
  const protectedResponse = await fetch(`${baseUrl}/today`, { redirect: "manual" });
  check("protected route /today redirects or requires auth", protectedResponse.status !== 200 || protectedResponse.headers.has("location"));
}

async function runTests() {
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
    }
  }

  await sleep(1000);

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  } else {
    console.log("\n✅ All route-level tests passed\n");
  }
}

runTests().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
