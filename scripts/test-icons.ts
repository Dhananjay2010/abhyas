#!/usr/bin/env node
export {};
/**
 * Test: Icon dimensions
 *
 * Verifies that all PNG icons have exactly the dimensions declared in the manifest.
 * Reads PNG headers directly to check width and height.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Read PNG dimensions from file header.
 * PNG spec: width and height are at bytes 16-23 (big-endian uint32)
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  
  // Check PNG signature
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fileSignature = buffer.slice(0, 8);
  assert(
    fileSignature.equals(pngSignature),
    `${filePath} is not a valid PNG file`
  );

  // Read IHDR chunk (starts at byte 8)
  // IHDR structure: length(4) + type(4) + width(4) + height(4) + ...
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

function testIconDimensions() {
  console.log("\n▶ Testing icon dimensions...");

  const iconsDir = path.join(__dirname, "..", "public", "icons");
  
  const expectedSizes = [
    { file: "icon-192.png", width: 192, height: 192 },
    { file: "icon-512.png", width: 512, height: 512 },
    { file: "icon-192-maskable.png", width: 192, height: 192 },
    { file: "icon-512-maskable.png", width: 512, height: 512 },
    { file: "apple-touch-icon.png", width: 180, height: 180 },
  ];

  for (const { file, width: expectedWidth, height: expectedHeight } of expectedSizes) {
    const filePath = path.join(iconsDir, file);
    assert(fs.existsSync(filePath), `Icon ${file} must exist`);

    const { width, height } = readPngDimensions(filePath);
    assert(
      width === expectedWidth && height === expectedHeight,
      `${file} must be ${expectedWidth}×${expectedHeight} (got: ${width}×${height})`
    );
    console.log(`  ✓ ${file}: ${width}×${height}`);
  }

  console.log("  ✓ All icons have correct dimensions");
}

function testScreenshotDimensions() {
  console.log("\n▶ Testing screenshot dimensions...");

  const screenshotsDir = path.join(__dirname, "..", "public", "screenshots");
  
  const expectedSizes = [
    { file: "screenshot-narrow.png", width: 1080, height: 1920, formFactor: "narrow" },
    { file: "screenshot-wide.png", width: 1920, height: 1080, formFactor: "wide" },
  ];

  for (const { file, width: expectedWidth, height: expectedHeight, formFactor } of expectedSizes) {
    const filePath = path.join(screenshotsDir, file);
    assert(fs.existsSync(filePath), `Screenshot ${file} must exist`);

    const { width, height } = readPngDimensions(filePath);
    assert(
      width === expectedWidth && height === expectedHeight,
      `${file} (${formFactor}) must be ${expectedWidth}×${expectedHeight} (got: ${width}×${height})`
    );
    console.log(`  ✓ ${file} (${formFactor}): ${width}×${height}`);
  }

  console.log("  ✓ All screenshots have correct dimensions");
}

function testManifestIconReferences() {
  console.log("\n▶ Testing manifest icon and screenshot references...");

  const manifestPath = path.join(__dirname, "..", "src", "app", "manifest.ts");
  const manifestContent = fs.readFileSync(manifestPath, "utf-8");
  
  // Check that manifest references icon files through branding config
  const iconReferences = [
    "branding.icons.icon192",
    "branding.icons.icon512",
    "branding.icons.maskable192",
    "branding.icons.maskable512",
  ];

  for (const ref of iconReferences) {
    assert(
      manifestContent.includes(ref),
      `Manifest must reference ${ref}`
    );
  }

  // Check that manifest references screenshots
  const screenshotPaths = [
    "/screenshots/screenshot-narrow.png",
    "/screenshots/screenshot-wide.png",
  ];

  for (const screenshotPath of screenshotPaths) {
    assert(
      manifestContent.includes(screenshotPath),
      `Manifest must reference ${screenshotPath}`
    );
  }

  // Check that manifest has a stable ID
  assert(
    manifestContent.includes("id:") && manifestContent.includes("branding.id"),
    "Manifest must have a stable id derived from branding.id"
  );

  // Check that manifest has screenshots with form_factor
  assert(
    manifestContent.includes("screenshots:") && 
    manifestContent.includes("form_factor") &&
    manifestContent.includes('"narrow"') &&
    manifestContent.includes('"wide"'),
    "Manifest must have screenshots with form_factor narrow and wide"
  );

  console.log("  ✓ Manifest references icons correctly via branding config");
  console.log("  ✓ Manifest includes screenshot paths");
  console.log("  ✓ Manifest has stable ID derived from brand");
  console.log("  ✓ Manifest includes narrow and wide screenshots");
}

function main() {
  console.log("Testing PWA Icon Dimensions");
  console.log("===========================");

  try {
    testIconDimensions();
    testScreenshotDimensions();
    testManifestIconReferences();

    console.log("\n✅ All icon and screenshot tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${(error as Error).message}\n`);
    process.exit(1);
  }
}

main();
/* eslint-enable @typescript-eslint/no-require-imports */
