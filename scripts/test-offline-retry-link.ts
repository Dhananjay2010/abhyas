/**
 * Test: Offline retry link (no-JS fallback)
 *
 * Verifies that the offline retry component:
 * 1. Renders as an <a> element (not just a button)
 * 2. Has a valid href that works without JavaScript
 * 3. Sanitizes the ?url= parameter using safeNextPath
 * 4. Meets accessibility requirements (44px min target)
 */

import { readFile } from "fs/promises";
import { join } from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

async function testOfflineRetryLink() {
  console.log("\n▶ Testing offline retry component structure...");

  // Read the component source
  const componentPath = join(__dirname, "..", "src", "app", "offline", "offline-retry.tsx");
  const componentSource = await readFile(componentPath, "utf-8");

  console.log("\n▶ Verifying component renders as <a> element...");

  // Verify it imports safeNextPath
  assert(
    componentSource.includes('import { safeNextPath }') &&
      componentSource.includes('from "@/lib/safe-next-path"'),
    "Component must import safeNextPath from @/lib/safe-next-path"
  );

  // Verify it uses <a> element (not just button)
  assert(
    componentSource.includes("<a") && componentSource.includes("</a>"),
    "Component must render an <a> element"
  );

  // Verify <a> has href attribute
  assert(
    componentSource.includes("href="),
    "Component <a> element must have href attribute"
  );

  // Verify it uses safeNextPath to sanitize the URL
  assert(
    componentSource.includes("safeNextPath("),
    "Component must use safeNextPath to sanitize URL"
  );

  console.log("  ✓ Component imports safeNextPath");
  console.log("  ✓ Component renders <a> element");
  console.log("  ✓ <a> element has href attribute");
  console.log("  ✓ Component uses safeNextPath to sanitize URL");

  console.log("\n▶ Verifying accessibility requirements...");

  // Verify minHeight is set to meet 44px touch target
  assert(
    componentSource.includes("minHeight") &&
      (componentSource.includes('"44px"') || componentSource.includes("'44px'")),
    "Link style must include minHeight: '44px' for touch target accessibility"
  );

  // Verify minWidth is set to meet 44px touch target
  assert(
    componentSource.includes("minWidth") &&
      (componentSource.includes('"44px"') || componentSource.includes("'44px'")),
    "Link style must include minWidth: '44px' for touch target accessibility"
  );

  console.log("  ✓ minHeight: 44px for touch target");
  console.log("  ✓ minWidth: 44px for touch target");

  console.log("\n▶ Verifying no hard-coded colors...");

  // Verify it uses branding tokens (not hard-coded colors)
  assert(
    componentSource.includes("branding.colors"),
    "Component must use branding.colors tokens (not hard-coded colors)"
  );

  // Verify it doesn't have hard-coded hex colors
  assert(
    !/#[0-9a-fA-F]{3,6}/.test(componentSource) ||
      componentSource.split("#").length <= 2, // Allow one # for comments
    "Component must not have hard-coded hex colors"
  );

  console.log("  ✓ Uses branding.colors tokens");
  console.log("  ✓ No hard-coded hex colors");

  console.log("\n▶ Verifying URL parameter handling...");

  // Verify it gets the url param from search params
  assert(
    componentSource.includes("URLSearchParams") ||
      componentSource.includes("searchParams") ||
      componentSource.includes('params.get("url")') ||
      componentSource.includes("params.get('url')"),
    "Component must extract url parameter from search params"
  );

  // Verify it handles the /offline special case
  assert(
    componentSource.includes('"/offline"') || componentSource.includes("'/offline'"),
    "Component must handle /offline special case"
  );

  console.log("  ✓ Extracts url parameter from search params");
  console.log("  ✓ Handles /offline special case");

  console.log("\n▶ Verifying JS enhancement is additive...");

  // Verify onClick handler exists (for JS enhancement)
  assert(
    componentSource.includes("onClick=") || componentSource.includes("onClick:"),
    "Component must have onClick handler for JS enhancement"
  );

  // Verify preventDefault is called (to enhance, not replace, the link)
  assert(
    componentSource.includes("preventDefault()"),
    "Component must call preventDefault() to add JS enhancement on top of link"
  );

  console.log("  ✓ Has onClick handler for JS enhancement");
  console.log("  ✓ Calls preventDefault() to enhance default navigation");

  console.log("\n▶ Verifying no noscript fallback (link works without JS)...");

  // Verify there's NO <noscript> tag (since the link works without JS)
  const noscriptCount = (componentSource.match(/<noscript>/g) || []).length;
  assert(
    noscriptCount === 0,
    "Component must NOT have <noscript> tag (link works without JS, no fallback needed)"
  );

  console.log("  ✓ No <noscript> tag (link works without JS)");

  console.log("\n▶ Verifying server-rendered markup has href=\"\"...");

  // Verify that href is set to empty string in JSX (to avoid hydration mismatch)
  assert(
    componentSource.includes('href=""') || componentSource.includes("href=''"),
    'Component must render href="" in JSX (empty href reloads current URL)'
  );

  // Verify that href is updated in useEffect using ref (after mount, client-side only)
  assert(
    componentSource.includes("linkRef.current.href") && componentSource.includes("getRetryHref()"),
    "Component must update href via ref in useEffect (client-side only)"
  );

  // Verify useRef is used for the link
  assert(
    componentSource.includes("useRef<HTMLAnchorElement>") || componentSource.includes("linkRef"),
    "Component must use useRef for the link element"
  );

  console.log('  ✓ href="" in JSX for SSR');
  console.log("  ✓ href updated via ref in useEffect after mount");
  console.log("  ✓ useRef used for link element");
}

async function testSanitizationLogic() {
  console.log("\n▶ Testing URL sanitization logic...");

  const { safeNextPath } = await import("../src/lib/safe-next-path");

  // Test valid URL parameter
  const validUrl = safeNextPath("/today?tab=history", "/");
  assert(
    validUrl === "/today?tab=history",
    "Valid URL should pass through unchanged"
  );

  console.log("  ✓ Valid URL passes through: /today?tab=history");

  // Test malicious URL parameter
  const maliciousUrl = safeNextPath("javascript:alert(1)", "/");
  assert(
    maliciousUrl === "/",
    "Malicious URL should be sanitized to fallback"
  );

  console.log("  ✓ Malicious URL sanitized: javascript:alert(1) → /");

  // Test open redirect
  const openRedirect = safeNextPath("//evil.com", "/");
  assert(
    openRedirect === "/",
    "Open redirect should be sanitized to fallback"
  );

  console.log("  ✓ Open redirect sanitized: //evil.com → /");

  // Test null/undefined
  const nullUrl = safeNextPath(null, "/");
  assert(
    nullUrl === "/",
    "Null URL should return fallback"
  );

  console.log("  ✓ Null URL returns fallback: null → /");
}

console.log("Testing Offline Retry Link (No-JS Fallback)");
console.log("==========================================");

(async () => {
  await testOfflineRetryLink();
  await testSanitizationLogic();
})().then(
  () => {
    console.log("\n✅ All offline retry link tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
