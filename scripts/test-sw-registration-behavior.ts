/**
 * Behavioral test: Service worker registration logic.
 *
 * Tests the pure syncServiceWorker function that determines whether to
 * register or unregister the service worker based on environment.
 *
 * This test FAILS on main because syncServiceWorker does not exist there.
 */

import {
  syncServiceWorker,
  type ServiceWorkerContainerLike,
  type ServiceWorkerRegistrationLike,
} from "../src/lib/sw-logic";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

console.log("Testing Service Worker Registration Behavior");
console.log("==========================================\n");

async function runTests() {
  console.log("▶ Testing syncServiceWorker in production...");

  // Mock ServiceWorkerContainer for production
  let productionRegistered = false;
  let productionGetRegistrationsCalled = false;

  const productionSW: ServiceWorkerContainerLike = {
    async register(scriptURL: string) {
      assert(
        scriptURL === "/sw.js",
        `Should register /sw.js, got ${scriptURL}`
      );
      productionRegistered = true;
      return {} as ServiceWorkerRegistration;
    },
    async getRegistrations() {
      productionGetRegistrationsCalled = true;
      return [];
    },
  };

  await syncServiceWorker("production", productionSW);

  assert(
    productionRegistered,
    "In production: should call register('/sw.js')"
  );

  assert(
    !productionGetRegistrationsCalled,
    "In production: should NOT call getRegistrations()"
  );

  console.log("  ✓ In production: calls register('/sw.js')");
  console.log("  ✓ In production: does not call getRegistrations()");

  console.log("\n▶ Testing syncServiceWorker in development...");

  // Mock ServiceWorkerContainer for development
  let devRegistered = false;
  let devUnregisterCount = 0;

  const mockRegistration1: ServiceWorkerRegistrationLike = {
    async unregister() {
      devUnregisterCount++;
      return true;
    },
    scope: "https://example.com/",
  };

  const mockRegistration2: ServiceWorkerRegistrationLike = {
    async unregister() {
      devUnregisterCount++;
      return true;
    },
    scope: "https://example.com/other/",
  };

  const devSW: ServiceWorkerContainerLike = {
    async register() {
      devRegistered = true;
      return {} as ServiceWorkerRegistration;
    },
    async getRegistrations() {
      return [mockRegistration1, mockRegistration2] as ServiceWorkerRegistration[];
    },
  };

  await syncServiceWorker("development", devSW);

  assert(
    !devRegistered,
    "In development: should NOT call register()"
  );

  assert(
    devUnregisterCount === 2,
    `In development: should unregister all 2 existing SWs, got ${devUnregisterCount}`
  );

  console.log("  ✓ In development: does not call register()");
  console.log("  ✓ In development: calls getRegistrations()");
  console.log("  ✓ In development: calls unregister() on all existing registrations (2)");

  console.log("\n▶ Testing syncServiceWorker with no existing registrations in dev...");

  let devEmptyUnregisterCount = 0;

  const devEmptySW: ServiceWorkerContainerLike = {
    async register() {
      throw new Error("Should not register in dev");
    },
    async getRegistrations() {
      return [];
    },
  };

  await syncServiceWorker("development", devEmptySW);

  assert(
    devEmptyUnregisterCount === 0,
    "In development with no existing SWs: should not call unregister"
  );

  console.log("  ✓ In development with no existing SWs: completes successfully");
  console.log("  ✓ In development with no existing SWs: does not throw");

  console.log("\n✅ All service worker registration behavioral tests passed\n");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
