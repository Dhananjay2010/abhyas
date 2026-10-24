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
  // We add a transparent margin to ensure the icon isn't clipped
  const maskableSizes = [
    { size: 192, name: "icon-192-maskable.png" },
    { size: 512, name: "icon-512-maskable.png" },
  ];

  for (const { size, name } of maskableSizes) {
    const contentSize = Math.floor(size * 0.8); // 80% for content, 20% for safe zone
    const padding = Math.floor((size - contentSize) / 2);

    const outputPath = path.join(iconsDir, name);

    // First resize to content size, then extend with padding
    await sharp(source)
      .resize(contentSize, contentSize)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
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

  console.log("\n✓ All icons generated successfully!");
  console.log(`  Icons directory: ${iconsDir}`);
}

generateIcons().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
/* eslint-enable @typescript-eslint/no-require-imports */
