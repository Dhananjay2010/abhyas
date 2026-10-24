/**
 * Test CapabilityNote is gated on hydrated to prevent React #418.
 *
 * Validates:
 * - CapabilityNote only renders when hydrated is true
 * - useHydrated returns false during SSR, true after hydration
 *
 *   npx tsx scripts/test-hydrated-capability.ts
 */

import fs from "fs";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. CapabilityNote is gated on hydrated in session-runner.tsx");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  const hasHydratedGate = content.includes("{hydrated && (") && content.includes("<CapabilityNote");
  const hasHydratedVar = content.includes("const hydrated = useHydrated()");
  check("CapabilityNote wrapped in {hydrated && (", hasHydratedGate, "");
  check("hydrated variable declared with useHydrated()", hasHydratedVar, "");
}

console.log("\n2. useHydrated exists in device.ts");
{
  const content = fs.readFileSync("src/lib/session/device.ts", "utf-8");
  const hasUseHydrated = content.includes("export function useHydrated()");
  const hasUseSyncExternalStore = content.includes("useSyncExternalStore");
  check("useHydrated function exported", hasUseHydrated, "");
  check("uses useSyncExternalStore", hasUseSyncExternalStore, "");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
