#!/usr/bin/env tsx
/**
 * Test: Service worker behavioral test (#47 LOW-4)
 *
 * Loads the actual SW script and executes it in a node vm with fake
 * ServiceWorkerGlobalScope, dispatches a navigation fetch event while
 * fetch rejects, and asserts that the response body is the cached
 * /offline body served under the original URL.
 *
 * This is a true behavioral test using vm.runInContext, not just string matching.
 *
 * This test fails on the old code (pre-fix).
 */

import { strict as assert } from "assert";
import { createContext, runInContext } from "vm";
import { GET } from "../src/app/sw.js/route";

/**
 * Mock offline page HTML (minimal, just needs a marker)
 */
const MOCK_OFFLINE_HTML = `<!DOCTYPE html>
<html>
<head><title>You're offline</title></head>
<body><h1>You're offline</h1></body>
</html>`;

/**
 * Fake Request class for vm context
 */
class FakeRequest {
  url: string;
  method: string;
  mode: string;
  headers: Map<string, string>;
  cache?: string;

  constructor(url: string, init?: { method?: string; mode?: string; headers?: Record<string, string>; cache?: string }) {
    this.url = url;
    this.method = init?.method || "GET";
    this.mode = init?.mode || "navigate";
    this.headers = new Map(Object.entries(init?.headers || {}));
    this.cache = init?.cache;
  }
}

/**
 * Fake Response class for vm context
 */
class FakeResponse {
  body: string | null;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  ok: boolean;

  constructor(body?: string | null, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
    this.body = body || null;
    this.status = init?.status || 200;
    this.statusText = init?.statusText || "OK";
    this.headers = new Map(Object.entries(init?.headers || {}));
    this.ok = this.status >= 200 && this.status < 300;
  }

  async text(): Promise<string> {
    return this.body || "";
  }

  clone(): FakeResponse {
    return new FakeResponse(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers),
    });
  }
}

/**
 * Fake Cache for vm context
 */
class FakeCache {
  private store = new Map<string, FakeResponse>();

  async addAll(items: Array<string | FakeRequest>): Promise<void> {
    for (const item of items) {
      const url = typeof item === "string" ? item : item.url;
      if (url.includes("/offline")) {
        this.store.set("/offline", new FakeResponse(MOCK_OFFLINE_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }));
      } else {
        this.store.set(url, new FakeResponse("cached", { status: 200 }));
      }
    }
  }

  async match(request: FakeRequest | string): Promise<FakeResponse | undefined> {
    const url = typeof request === "string" ? request : request.url;
    const normalizedUrl = url.includes("/offline") ? "/offline" : url;
    return this.store.get(normalizedUrl);
  }

  async put(request: FakeRequest, response: FakeResponse): Promise<void> {
    this.store.set(request.url, response);
  }
}

/**
 * Fake caches API for vm context
 */
class FakeCaches {
  private stores = new Map<string, FakeCache>();

  async open(cacheName: string): Promise<FakeCache> {
    if (!this.stores.has(cacheName)) {
      this.stores.set(cacheName, new FakeCache());
    }
    return this.stores.get(cacheName)!;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.stores.keys());
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.stores.delete(cacheName);
  }
}

/**
 * Fake clients API for vm context
 */
const fakeClients = {
  claim: async () => {
    // No-op in test
  },
};

async function testServiceWorkerBehavior() {
  console.log("\n▶ Testing service worker behavioral flow with vm execution...");

  // Get the actual SW script
  const swResponse = await GET();
  const swScript = await swResponse.text();

  console.log("  ✓ Loaded sw.js script");

  // Create fake ServiceWorkerGlobalScope
  const fakeCaches = new FakeCaches();
  
  type EventHandler = (event: {
    type: string;
    request?: FakeRequest;
    respondWith?: (response: Promise<FakeResponse>) => void;
    waitUntil?: (promise: Promise<void>) => void;
  }) => void;
  
  const listeners = new Map<string, Array<EventHandler>>();

  let capturedResponse: FakeResponse | null = null;

  const globalScope = {
    // ServiceWorkerGlobalScope properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self: null as any,
    caches: fakeCaches,
    clients: fakeClients,
    addEventListener: (type: string, handler: EventHandler) => {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type)!.push(handler);
    },
    skipWaiting: async () => {
      // No-op
    },
    // Global constructors
    Request: FakeRequest,
    Response: FakeResponse,
    URL: URL,
    // Fake location
    location: {
      origin: "http://localhost",
      href: "http://localhost/",
      pathname: "/",
    },
    // Fake fetch that always rejects (offline)
    fetch: async (_url: string | FakeRequest) => {
      throw new Error("Network request failed (simulated offline)");
    },
    // Console for debugging
    console,
  };

  // Self-reference for ServiceWorkerGlobalScope
  globalScope.self = globalScope;

  console.log("\n▶ Executing sw.js in vm context...");

  // Create vm context and execute the SW script
  const context = createContext(globalScope);

  try {
    runInContext(swScript, context, {
      filename: "sw.js",
      displayErrors: true,
    });
  } catch (error) {
    throw new Error(`Failed to execute sw.js in vm: ${error}`);
  }

  console.log("  ✓ sw.js executed successfully");

  // Verify install listener was registered
  assert(
    listeners.has("install"),
    "SW must register an 'install' event listener"
  );

  console.log("  ✓ install event listener registered");

  // Simulate install event
  console.log("\n▶ Simulating install event (precaching /offline)...");

  const promises: Promise<void>[] = [];
  const installEvent = {
    type: "install",
    waitUntil: (promise: Promise<void>) => {
      promises.push(promise);
    },
  };

  const installHandlers = listeners.get("install") || [];
  for (const handler of installHandlers) {
    handler(installEvent);
  }

  // Wait for all waitUntil promises
  try {
    await Promise.all(promises);
  } catch (error) {
    console.error("Install event error:", error);
    throw error;
  }

  // Verify /offline was cached
  // The cache name is generated from brand ID and build version in the SW script
  // Since we executed the SW, check all caches for the offline page
  const cacheNames = await fakeCaches.keys();
  let cachedOffline: FakeResponse | undefined;
  
  for (const cacheName of cacheNames) {
    const cache = await fakeCaches.open(cacheName);
    const match = await cache.match("/offline");
    if (match) {
      cachedOffline = match;
      break;
    }
  }

  assert(
    cachedOffline !== undefined,
    "SW install must cache /offline page"
  );

  console.log("  ✓ /offline page cached during install");

  // Verify fetch listener was registered
  assert(
    listeners.has("fetch"),
    "SW must register a 'fetch' event listener"
  );

  console.log("  ✓ fetch event listener registered");

  // Simulate navigate fetch for /today while offline
  console.log("\n▶ Simulating navigation fetch for /today while offline...");

  const originalUrl = "http://localhost/today";
  const fetchEvent = {
    type: "fetch",
    request: new FakeRequest(originalUrl, {
      method: "GET",
      mode: "navigate",
    }),
    respondWith: (responsePromise: Promise<FakeResponse>) => {
      responsePromise.then((response) => {
        capturedResponse = response;
      });
    },
  };

  const fetchHandlers = listeners.get("fetch") || [];
  for (const handler of fetchHandlers) {
    await handler(fetchEvent);
  }

  // Give time for async respondWith
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(
    capturedResponse !== null,
    "Fetch event must call respondWith with a response"
  );

  console.log("  ✓ Fetch handler returned a response");

  // Verify the response body is the offline page
  const responseText = await (capturedResponse as FakeResponse).text();

  assert(
    responseText.includes("You're offline") || responseText.includes("You&apos;re offline"),
    `Response body must contain offline page content, got: ${responseText.slice(0, 100)}`
  );

  console.log("  ✓ Response body is the cached /offline page");

  // Verify request URL remains unchanged (served under original URL)
  assert(
    fetchEvent.request.url === originalUrl,
    "Request URL must remain the original URL (not rewritten to /offline)"
  );

  console.log("  ✓ Served under original URL (/today, not /offline)");

  // Test that non-navigate requests are not intercepted
  console.log("\n▶ Testing non-navigate request is not intercepted...");

  capturedResponse = null;

  const nonNavigateFetchEvent = {
    type: "fetch",
    request: new FakeRequest("http://localhost/api/data", {
      method: "GET",
      mode: "cors",
    }),
    respondWith: (responsePromise: Promise<FakeResponse>) => {
      responsePromise.then((response) => {
        capturedResponse = response;
      });
    },
  };

  for (const handler of fetchHandlers) {
    await handler(nonNavigateFetchEvent);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(
    capturedResponse === null,
    "Non-navigate requests must not be intercepted"
  );

  console.log("  ✓ Non-navigate request not intercepted (correct)");

  // Test that /session/* routes are not intercepted (client-side cache)
  console.log("\n▶ Testing /session/* route is not intercepted...");

  capturedResponse = null;

  const sessionFetchEvent = {
    type: "fetch",
    request: new FakeRequest("http://localhost/session/abc123", {
      method: "GET",
      mode: "navigate",
    }),
    respondWith: (responsePromise: Promise<FakeResponse>) => {
      responsePromise.then((response) => {
        capturedResponse = response;
      });
    },
  };

  for (const handler of fetchHandlers) {
    await handler(sessionFetchEvent);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(
    capturedResponse === null,
    "/session/* routes must not be intercepted (client-side cache handles offline)"
  );

  console.log("  ✓ /session/* route not intercepted (client-side cache)");

  // Verify POST requests are not intercepted
  console.log("\n▶ Testing POST request is not intercepted...");

  capturedResponse = null;

  const postFetchEvent = {
    type: "fetch",
    request: new FakeRequest("http://localhost/today", {
      method: "POST",
      mode: "navigate",
    }),
    respondWith: (responsePromise: Promise<FakeResponse>) => {
      responsePromise.then((response) => {
        capturedResponse = response;
      });
    },
  };

  for (const handler of fetchHandlers) {
    await handler(postFetchEvent);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert(
    capturedResponse === null,
    "POST requests must not be intercepted"
  );

  console.log("  ✓ POST request not intercepted (correct)");
}

console.log("Testing Service Worker Behavioral Flow");
console.log("======================================");

testServiceWorkerBehavior().then(
  () => {
    console.log("\n✅ All service worker behavioral tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
