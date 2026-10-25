/**
 * Test: Service worker registration is a no-op in development.
 *
 * Verifies that the registration component explicitly unregisters any
 * existing service worker in dev mode, so HMR keeps working.
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

console.log("Testing Service Worker Registration (Dev Mode)");
console.log("==============================================\n");

console.log("▶ Testing SW registration component behavior in dev...");

const componentPath = path.join(
  __dirname,
  "..",
  "src",
  "components",
  "service-worker-registration.tsx"
);

const componentSource = fs.readFileSync(componentPath, "utf-8");

// Must check NODE_ENV
assert(
  componentSource.includes("process.env.NODE_ENV"),
  "Component must check process.env.NODE_ENV to distinguish prod vs dev"
);

// Must have different behavior for production vs development
assert(
  componentSource.includes('=== "production"') || componentSource.includes("=== 'production'"),
  "Component must check for production environment"
);

// In production: registers service worker
assert(
  componentSource.includes("serviceWorker") && componentSource.includes("register"),
  "Component must call navigator.serviceWorker.register in production"
);

assert(
  componentSource.includes('"/sw.js"') || componentSource.includes("'/sw.js'"),
  "Component must register /sw.js as the service worker path"
);

// In development: unregisters existing service workers
assert(
  componentSource.includes("navigator.serviceWorker.getRegistrations"),
  "Component must call navigator.serviceWorker.getRegistrations in dev to find existing SWs"
);

assert(
  componentSource.includes(".unregister()"),
  "Component must call .unregister() on existing registrations in dev"
);

// Must check for serviceWorker support
assert(
  componentSource.includes('"serviceWorker" in navigator') ||
  componentSource.includes("'serviceWorker' in navigator"),
  "Component must check for 'serviceWorker' in navigator before using the API"
);

// Should have a useEffect hook (client-side only)
assert(
  componentSource.includes("useEffect"),
  "Component must use useEffect to run registration logic on the client"
);

// Should be a client component
assert(
  componentSource.includes('"use client"') || componentSource.includes("'use client'"),
  'Component must have "use client" directive for Next.js App Router'
);

console.log("  ✓ Component checks process.env.NODE_ENV");
console.log('  ✓ In production: calls navigator.serviceWorker.register("/sw.js")');
console.log("  ✓ In development: calls navigator.serviceWorker.getRegistrations()");
console.log("  ✓ In development: calls .unregister() on existing registrations");
console.log("  ✓ Component checks for serviceWorker support");
console.log("  ✓ Component uses useEffect for client-side logic");
console.log('  ✓ Component has "use client" directive');

console.log("\n▶ Testing that component is mounted in root layout...");

const layoutPath = path.join(__dirname, "..", "src", "app", "layout.tsx");
const layoutSource = fs.readFileSync(layoutPath, "utf-8");

assert(
  layoutSource.includes("ServiceWorkerRegistration"),
  "Root layout must import and mount ServiceWorkerRegistration component"
);

assert(
  layoutSource.includes("<ServiceWorkerRegistration />"),
  "Root layout must render <ServiceWorkerRegistration /> component"
);

console.log("  ✓ ServiceWorkerRegistration is imported in root layout");
console.log("  ✓ ServiceWorkerRegistration is rendered in root layout");

console.log("\n✅ All SW registration (dev mode) tests passed\n");
