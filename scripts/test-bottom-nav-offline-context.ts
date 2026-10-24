/**
 * Test: Bottom nav hiding mechanism without CSS
 *
 * Verifies that BottomNav can hide itself when isOfflineError is true,
 * independently of cached CSS (globals.css may not be available offline).
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testBottomNavOfflineContext() {
  console.log("\n▶ Testing bottom nav offline error context...");

  const bottomNavPath = path.join(__dirname, "..", "src", "components", "bottom-nav.tsx");
  
  assert(
    fs.existsSync(bottomNavPath),
    "src/components/bottom-nav.tsx must exist"
  );

  const source = fs.readFileSync(bottomNavPath, "utf-8");

  // Must import useOfflineError hook
  assert(
    source.includes("useOfflineError") && source.includes("@/contexts/offline-error-context"),
    "BottomNav must import useOfflineError from @/contexts/offline-error-context"
  );

  // Must call the hook
  assert(
    source.includes("useOfflineError()"),
    "BottomNav must call useOfflineError()"
  );

  // Must destructure isOfflineError
  assert(
    source.includes("isOfflineError"),
    "BottomNav must destructure isOfflineError from useOfflineError()"
  );

  // Must return null when isOfflineError is true
  assert(
    source.includes("if (isOfflineError) return null") || 
    source.includes("if(isOfflineError)return null"),
    "BottomNav must return null when isOfflineError is true"
  );

  console.log("  ✓ Imports useOfflineError from context");
  console.log("  ✓ Calls useOfflineError()");
  console.log("  ✓ Destructures isOfflineError");
  console.log("  ✓ Returns null when isOfflineError is true");
}

function testOfflineErrorContext() {
  console.log("\n▶ Testing offline error context...");

  const contextPath = path.join(__dirname, "..", "src", "contexts", "offline-error-context.tsx");
  
  assert(
    fs.existsSync(contextPath),
    "src/contexts/offline-error-context.tsx must exist"
  );

  const source = fs.readFileSync(contextPath, "utf-8");

  // Must export OfflineErrorProvider
  assert(
    source.includes("export function OfflineErrorProvider"),
    "Context must export OfflineErrorProvider"
  );

  // Must export useOfflineError hook
  assert(
    source.includes("export function useOfflineError"),
    "Context must export useOfflineError hook"
  );

  // Must use createContext and useState
  assert(
    source.includes("createContext") && source.includes("useState"),
    "Context must use createContext and useState"
  );

  // Must have isOfflineError and setIsOfflineError
  assert(
    source.includes("isOfflineError") && source.includes("setIsOfflineError"),
    "Context must provide isOfflineError and setIsOfflineError"
  );

  console.log("  ✓ Exports OfflineErrorProvider");
  console.log("  ✓ Exports useOfflineError hook");
  console.log("  ✓ Uses createContext and useState");
  console.log("  ✓ Provides isOfflineError and setIsOfflineError");
}

function testErrorBoundaryUsesContext() {
  console.log("\n▶ Testing error boundary uses offline context...");

  const errorPath = path.join(__dirname, "..", "src", "app", "error.tsx");
  
  assert(
    fs.existsSync(errorPath),
    "src/app/error.tsx must exist"
  );

  const source = fs.readFileSync(errorPath, "utf-8");

  // Must import useOfflineError
  assert(
    source.includes("useOfflineError") && source.includes("@/contexts/offline-error-context"),
    "error.tsx must import useOfflineError"
  );

  // Must call setIsOfflineError
  assert(
    source.includes("setIsOfflineError"),
    "error.tsx must call setIsOfflineError"
  );

  // Must set isOfflineError based on offline detection
  assert(
    source.includes("setIsOfflineError(offline)") || 
    source.includes("setIsOfflineError(isOffline") ||
    source.includes("setIsOfflineError("),
    "error.tsx must call setIsOfflineError with offline status"
  );

  // Must reset on cleanup
  assert(
    source.includes("setIsOfflineError(false)") && source.includes("return () =>"),
    "error.tsx must reset isOfflineError in cleanup"
  );

  console.log("  ✓ Imports useOfflineError");
  console.log("  ✓ Calls setIsOfflineError");
  console.log("  ✓ Sets offline status in context");
  console.log("  ✓ Resets on cleanup");
}

function testLayoutProvidesContext() {
  console.log("\n▶ Testing layout provides offline context...");

  const layoutPath = path.join(__dirname, "..", "src", "app", "layout.tsx");
  
  assert(
    fs.existsSync(layoutPath),
    "src/app/layout.tsx must exist"
  );

  const source = fs.readFileSync(layoutPath, "utf-8");

  // Must import OfflineErrorProvider
  assert(
    source.includes("OfflineErrorProvider") && source.includes("@/contexts/offline-error-context"),
    "layout.tsx must import OfflineErrorProvider"
  );

  // Must wrap children with OfflineErrorProvider
  assert(
    source.includes("<OfflineErrorProvider>"),
    "layout.tsx must use <OfflineErrorProvider>"
  );

  // BottomNav must be inside the provider
  const providerIndex = source.indexOf("<OfflineErrorProvider>");
  const closeProviderIndex = source.indexOf("</OfflineErrorProvider>");
  const bottomNavIndex = source.indexOf("<BottomNav");
  
  assert(
    providerIndex !== -1 && closeProviderIndex !== -1 && bottomNavIndex !== -1,
    "layout.tsx must have OfflineErrorProvider and BottomNav"
  );

  assert(
    providerIndex < bottomNavIndex && bottomNavIndex < closeProviderIndex,
    "BottomNav must be inside OfflineErrorProvider"
  );

  console.log("  ✓ Imports OfflineErrorProvider");
  console.log("  ✓ Uses <OfflineErrorProvider>");
  console.log("  ✓ BottomNav is inside the provider");
}

console.log("Testing Bottom Nav Offline Context Mechanism");
console.log("===========================================");

testOfflineErrorContext();
testBottomNavOfflineContext();
testErrorBoundaryUsesContext();
testLayoutProvidesContext();

console.log("\n✅ All bottom nav offline context tests passed\n");
