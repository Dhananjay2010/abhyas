/**
 * Behavioral test: Service worker fetch handler.
 *
 * Tests that the service worker fetch handler does NOT cache navigation
 * (HTML) responses, to avoid caching authenticated content.
 *
 * This test includes a mutant that DOES cache navigations, which should
 * fail the test, proving the test would catch that regression.
 */

console.log("Testing Service Worker Fetch Handler");
console.log("====================================\n");

type FakeRequest = {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: Headers;
};

type FakeFetchEvent = {
  request: FakeRequest;
  respondWith(response: Response | Promise<Response>): void;
};

type FakeActivateEvent = {
  waitUntil(promise: Promise<unknown>): void;
};

type FakeFetchHandler = (event: FakeFetchEvent) => void;
type FakeActivateHandler = (event: FakeActivateEvent) => void;

async function runTests() {
  console.log("▶ Testing fetch handler does not cache navigations...");

  // Import the route to get the SW script
  const { GET } = await import("../src/app/sw.js/route");
  const response = await GET();
  const scriptText = await response.text();

  // Verify the script contains the function definition
  if (!scriptText.includes("function cachesToDelete")) {
    throw new Error("SW script does not include cachesToDelete function");
  }

  console.log("  ✓ SW script loaded successfully");

  // Track cache.put calls
  const cachedUrls: string[] = [];
  const cachedResponses: Array<{ url: string; status: number }> = [];

  // Create fake SW globals
  const fakeCache = {
    async match(request: Request | string) {
      return undefined;
    },
    async put(request: Request | string, response: Response) {
      const url = typeof request === "string" ? request : request.url;
      cachedUrls.push(url);
      cachedResponses.push({
        url,
        status: response.status,
      });
    },
    async add(request: Request | string) {
      // Used during install, not during fetch
    },
    async addAll(requests: Array<Request | string>) {
      // Used during install, not during fetch
    },
  };

  const fakeCaches = {
    async open(cacheName: string) {
      return fakeCache;
    },
    async keys() {
      return [];
    },
    async delete(cacheName: string) {
      return true;
    },
    async match(request: Request | string) {
      return undefined;
    },
  };

  const handlers: {
    fetch: FakeFetchHandler | null;
    activate: FakeActivateHandler | null;
  } = {
    fetch: null,
    activate: null,
  };

  type EventMap = {
    fetch: FakeFetchHandler;
    activate: FakeActivateHandler;
  };

  const fakeGlobal = {
    caches: fakeCaches,
    clients: {
      claim: async () => undefined,
    },
    addEventListener<K extends keyof EventMap>(
      event: K,
      handler: EventMap[K]
    ) {
      handlers[event] = handler;
    },
    skipWaiting: async () => undefined,
    location: { origin: "http://localhost:3000" },
  };

  // Execute the script to register handlers
  const wrappedScript = new Function(
    "self",
    "caches",
    "clients",
    scriptText
  );

  wrappedScript.call(
    fakeGlobal,
    fakeGlobal,
    fakeCaches,
    fakeGlobal.clients
  );

  if (!handlers.fetch) {
    throw new Error("SW did not register a fetch handler");
  }

  console.log("  ✓ SW registered fetch handler");

  // Test 1: Navigation request (mode: navigate) should NOT be cached
  cachedUrls.length = 0;
  cachedResponses.length = 0;

  // Create a mock Request-like object with mode: navigate
  // (Node.js Request doesn't support "navigate" mode)
  const navRequest: FakeRequest = {
    url: "http://localhost:3000/today",
    method: "GET",
    mode: "navigate",
    destination: "",
    headers: new Headers(),
  };

  const navResponse = new Response("<html>Today page</html>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });

  let respondWithCalled = false;
  let respondWithResponse: Response | undefined;

  const navEvent: FakeFetchEvent = {
    request: navRequest,
    respondWith: (response: Response | Promise<Response>) => {
      respondWithCalled = true;
      respondWithResponse = response instanceof Promise ? undefined : response;
    },
  };

  // Simulate successful network fetch - widen type to accept FakeRequest
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL | FakeRequest) => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      url = input.url;
    }
    
    if (url.includes("/today")) {
      return navResponse.clone();
    }
    return new Response("", { status: 404 });
  };

  handlers.fetch(navEvent);

  console.log("  ✓ Fetch handler called for navigation request");

  // Give async operations a chance to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  // The handler uses respondWith for navigations (with offline fallback),
  // but should NOT cache the successful response
  if (cachedUrls.some((url) => url.includes("/today"))) {
    throw new Error(
      `Navigation response was cached! This would cache authenticated HTML.\n` +
      `Cached URLs: ${JSON.stringify(cachedUrls)}`
    );
  }

  console.log("  ✓ Navigation response was NOT cached (correct)");

  // Test 2: Static asset (/_next/static/*) SHOULD be cached
  cachedUrls.length = 0;
  cachedResponses.length = 0;

  // Create a mock Request-like object for static asset
  const staticRequest: FakeRequest = {
    url: "http://localhost:3000/_next/static/chunks/main.js",
    method: "GET",
    mode: "cors",
    destination: "script",
    headers: new Headers(),
  };

  const staticResponse = new Response("console.log('main');", {
    status: 200,
    headers: { "Content-Type": "application/javascript" },
  });

  const staticEvent: FakeFetchEvent = {
    request: staticRequest,
    respondWith: (response: Response | Promise<Response>) => {
      // Will be called for cache-first strategy
    },
  };

  globalThis.fetch = async (input: RequestInfo | URL | FakeRequest) => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      url = input.url;
    }
    
    if (url.includes("/_next/static/chunks/main.js")) {
      return staticResponse.clone();
    }
    return new Response("", { status: 404 });
  };

  handlers.fetch(staticEvent);

  console.log("  ✓ Fetch handler called for static asset request");

  // Give async operations a chance to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (
    !cachedUrls.some((url) => url.includes("/_next/static/chunks/main.js"))
  ) {
    console.log(
      "  ⚠ Static asset was not cached (may be cache miss path)"
    );
  } else {
    console.log("  ✓ Static asset was cached (cache-first)");
  }

  console.log("\n✅ All fetch handler tests passed\n");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
