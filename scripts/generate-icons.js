#!/usr/bin/env node
/**
 * Generate PWA icons from icon-source.svg
 *
 * Run: npm run generate-icons (or node scripts/generate-icons.js)
 *
 * This script is deterministic: given the same SVG source, it produces
 * identical PNG outputs. Icons are committed to the repo so white-label
 * deployments can regenerate them from their own branded SVG.
 *
 * Dependencies: sharp (already used by Next.js for image optimization)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

async function generateIcons() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error(
      "Error: sharp is required but not installed. Run: npm install --save-dev sharp"
    );
    process.exit(1);
  }

  const sourceFile = path.join(__dirname, "..", "public", "icon-source.svg");
  const iconsDir = path.join(__dirname, "..", "public", "icons");

  // Ensure the icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const source = fs.readFileSync(sourceFile);

  console.log("Generating PWA icons from icon-source.svg...\n");

  // Standard icons (no safe zone)
  const standardSizes = [
    { size: 192, name: "icon-192.png" },
    { size: 512, name: "icon-512.png" },
    { size: 180, name: "apple-touch-icon.png" }, // iOS home screen
  ];

  for (const { size, name } of standardSizes) {
    const outputPath = path.join(iconsDir, name);
    await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(outputPath);
    console.log(`✓ Generated ${name} (${size}×${size})`);
  }

  // Maskable icons (with safe zone)
  // Android adaptive icons require a 20% safe zone around the content
  // We add padding to ensure the icon isn't clipped
  const maskableSizes = [
    { size: 192, name: "icon-192-maskable.png" },
    { size: 512, name: "icon-512-maskable.png" },
  ];

  for (const { size, name } of maskableSizes) {
    const contentSize = Math.floor(size * 0.8); // 80% for content, 20% for safe zone
    const totalPadding = size - contentSize;
    // Split padding, ensuring the total adds up exactly
    const paddingTop = Math.floor(totalPadding / 2);
    const paddingBottom = totalPadding - paddingTop;

    const outputPath = path.join(iconsDir, name);

    // First resize to content size, then extend with padding
    await sharp(source)
      .resize(contentSize, contentSize)
      .extend({
        top: paddingTop,
        bottom: paddingBottom,
        left: paddingTop,
        right: paddingBottom,
        background: { r: 10, g: 12, b: 14, alpha: 1 }, // Match themeColor #0a0c0e
      })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`✓ Generated ${name} (${size}×${size}, maskable with safe zone)`);
  }

  // Generate favicon.ico (32×32 PNG)
  const favicon32 = await sharp(source).resize(32, 32).png().toBuffer();

  // For .ico generation, we'll just create a 32×32 PNG as favicon.ico
  // Browsers support PNG favicons universally now
  const faviconPath = path.join(__dirname, "..", "public", "favicon.ico");
  fs.writeFileSync(faviconPath, favicon32);
  console.log(`✓ Generated favicon.ico (32×32 PNG)`);

  // Generate manifest screenshots
  // These are deterministic branded placeholders for the install UI
  console.log("\nGenerating manifest screenshots...\n");

  const screenshotsDir = path.join(__dirname, "..", "public", "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Read brand colors from the branding config (or use defaults)
  const bgColor = { r: 10, g: 12, b: 14, alpha: 1 }; // #0a0c0e

  // Narrow screenshot (phone, portrait)
  const narrowWidth = 1080;
  const narrowHeight = 1920;
  const narrowIconSize = 240;
  const narrowIconPadding = (narrowWidth - narrowIconSize) / 2;

  await sharp({
    create: {
      width: narrowWidth,
      height: narrowHeight,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([
      {
        input: await sharp(source).resize(narrowIconSize, narrowIconSize).toBuffer(),
        top: Math.floor((narrowHeight - narrowIconSize) / 2),
        left: Math.floor(narrowIconPadding),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(screenshotsDir, "screenshot-narrow.png"));

  console.log(`✓ Generated screenshot-narrow.png (${narrowWidth}×${narrowHeight})`);

  // Wide screenshot (desktop, landscape)
  const wideWidth = 1920;
  const wideHeight = 1080;
  const wideIconSize = 200;

  await sharp({
    create: {
      width: wideWidth,
      height: wideHeight,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([
      {
        input: await sharp(source).resize(wideIconSize, wideIconSize).toBuffer(),
        top: Math.floor((wideHeight - wideIconSize) / 2),
        left: Math.floor((wideWidth - wideIconSize) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(screenshotsDir, "screenshot-wide.png"));

  console.log(`✓ Generated screenshot-wide.png (${wideWidth}×${wideHeight})`);

  console.log("\n✓ All icons and screenshots generated successfully!");
  console.log(`  Icons directory: ${iconsDir}`);
  console.log(`  Screenshots directory: ${screenshotsDir}`);
}

generateIcons().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
/* eslint-enable @typescript-eslint/no-require-imports */
