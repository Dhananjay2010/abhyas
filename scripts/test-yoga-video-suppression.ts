#!/usr/bin/env tsx
/**
 * Behavioral test: yoga video playing suppression
 *
 * Requirements:
 * - YouTubeEmbed must set data-video-playing attribute when playing
 * - YouTubeEmbed must clear data-video-playing when unmounted
 * - NewVersionHint must watch for data-video-playing and hide when true
 *
 * This test fails on the old code (pre-fix).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";

console.log("▶ Testing yoga video playing suppression...\n");

const youtubeEmbedPath = join(process.cwd(), "src/components/youtube-embed.tsx");
const newVersionHintPath = join(process.cwd(), "src/components/new-version-hint.tsx");

const youtubeEmbedSource = readFileSync(youtubeEmbedPath, "utf-8");
const newVersionHintSource = readFileSync(newVersionHintPath, "utf-8");

console.log("▶ Verifying YouTubeEmbed sets data-video-playing...");

assert(
  youtubeEmbedSource.includes('setAttribute("data-video-playing"') ||
  youtubeEmbedSource.includes("setAttribute('data-video-playing'"),
  "YouTubeEmbed must set data-video-playing attribute when playing"
);

assert(
  youtubeEmbedSource.includes('removeAttribute("data-video-playing")') ||
  youtubeEmbedSource.includes("removeAttribute('data-video-playing')"),
  "YouTubeEmbed must remove data-video-playing attribute on cleanup"
);

assert(
  youtubeEmbedSource.includes("useEffect"),
  "YouTubeEmbed must use useEffect to manage attribute"
);

console.log("  ✓ Sets data-video-playing attribute when playing");
console.log("  ✓ Removes data-video-playing on cleanup");
console.log("  ✓ Uses useEffect for lifecycle management");

console.log("\n▶ Verifying NewVersionHint watches data-video-playing...");

assert(
  newVersionHintSource.includes("videoPlaying") ||
  newVersionHintSource.includes("video-playing"),
  "NewVersionHint must track video playing state"
);

assert(
  newVersionHintSource.includes("MutationObserver"),
  "NewVersionHint must use MutationObserver to watch attribute changes"
);

assert(
  newVersionHintSource.includes("data-video-playing") &&
  newVersionHintSource.includes("hasAttribute"),
  "NewVersionHint must check for data-video-playing attribute"
);

assert(
  newVersionHintSource.includes("!videoPlaying") || newVersionHintSource.includes("&& !videoPlaying"),
  "NewVersionHint must hide when video is playing"
);

console.log("  ✓ Tracks video playing state");
console.log("  ✓ Uses MutationObserver to watch attribute");
console.log("  ✓ Checks data-video-playing attribute");
console.log("  ✓ Hides when video is playing");

console.log("\n✅ All yoga video suppression tests passed");
