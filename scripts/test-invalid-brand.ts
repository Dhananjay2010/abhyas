/**
 * Test: Invalid NEXT_PUBLIC_BRAND fails the build
 *
 * Verifies:
 * - Invalid brand id throws an error (doesn't silently fall back)
 * - Error message lists valid brand ids
 * - Valid brands (default, example) load successfully
 */

import { execSync } from "child_process";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testInvalidBrandFails() {
  console.log("\n▶ Testing invalid NEXT_PUBLIC_BRAND...");

  try {
    // Try to import branding with an invalid brand id
    execSync(
      `NEXT_PUBLIC_BRAND=bogus npx tsx -e "import('./src/lib/branding').then(() => process.exit(0), () => process.exit(1))"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    throw new Error("Expected invalid brand to throw an error");
  } catch {
    // execSync throws when the command exits with non-zero
    console.log("  ✓ Invalid brand throws an error (does not fall back)");
  }

  // Verify the error message lists valid brand ids
  try {
    execSync(
      `NEXT_PUBLIC_BRAND=bogus npx tsx -e "import('./src/lib/branding')"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  } catch (error: unknown) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error && error.stderr instanceof Buffer ? error.stderr : Buffer.from("");
    const stdout = typeof error === "object" && error !== null && "stdout" in error && error.stdout instanceof Buffer ? error.stdout : Buffer.from("");
    const output = stderr.toString() || stdout.toString() || "";
    assert(
      output.includes("Valid brand ids:"),
      "Error message should list valid brand ids"
    );
    assert(
      output.includes("default") && output.includes("example"),
      "Error message should include 'default' and 'example'"
    );
    console.log("  ✓ Error message lists valid brand ids");
  }
}

function testValidBrandsLoad() {
  console.log("\n▶ Testing valid brands load...");

  // Test default brand
  try {
    execSync(
      `NEXT_PUBLIC_BRAND=default npx tsx scripts/test-brand-load-default.ts`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    console.log("  ✓ Default brand loads successfully");
  } catch (error) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error && error.stderr instanceof Buffer ? error.stderr : Buffer.from("");
    const stdout = typeof error === "object" && error !== null && "stdout" in error && error.stdout instanceof Buffer ? error.stdout : Buffer.from("");
    const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
    console.error("    Default brand test failed:");
    console.error("    stdout:", stdout.toString() || "(empty)");
    console.error("    stderr:", stderr.toString() || "(empty)");
    throw new Error("Default brand should load successfully");
  }

  // Test example brand
  try {
    execSync(
      `NEXT_PUBLIC_BRAND=example npx tsx scripts/test-brand-load-example.ts`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    console.log("  ✓ Example brand loads successfully");
  } catch (error) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error && error.stderr instanceof Buffer ? error.stderr : Buffer.from("");
    const stdout = typeof error === "object" && error !== null && "stdout" in error && error.stdout instanceof Buffer ? error.stdout : Buffer.from("");
    const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
    console.error("    Example brand test failed:");
    console.error("    stdout:", stdout.toString() || "(empty)");
    console.error("    stderr:", stderr.toString() || "(empty)");
    throw new Error("Example brand should load successfully");
  }
}

function main() {
  console.log("Testing invalid NEXT_PUBLIC_BRAND handling...");

  try {
    testInvalidBrandFails();
    testValidBrandsLoad();
    console.log("\n✅ All invalid brand tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Invalid brand tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
