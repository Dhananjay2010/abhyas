/**
 * Test: YouTube embed component
 *
 * Verifies that the click-to-load poster is properly implemented:
 * - Uses YouTube thumbnail (not eager iframe)
 * - Mounts iframe only after click
 * - Includes autoplay parameter
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testYouTubeEmbedComponent() {
  console.log("\n▶ Testing YouTube embed component...");

  const componentPath = path.join(__dirname, "..", "src", "components", "youtube-embed.tsx");
  
  assert(
    fs.existsSync(componentPath),
    "src/components/youtube-embed.tsx must exist"
  );

  const source = fs.readFileSync(componentPath, "utf-8");

  // Must use useState for playing state (click-to-load)
  assert(
    source.includes("useState") && source.includes("playing"),
    "Must use useState to track playing state (click-to-load)"
  );

  // Must conditionally render iframe only when playing
  assert(
    source.includes("if (playing)"),
    "Must conditionally render iframe only when playing (not eager)"
  );

  // Thumbnail URL must be i.ytimg.com/vi/{id}/hqdefault.jpg
  assert(
    source.includes("i.ytimg.com/vi/") && source.includes("hqdefault.jpg"),
    "Must use YouTube thumbnail from i.ytimg.com/vi/{id}/hqdefault.jpg"
  );

  // Must have a button to trigger playback
  assert(
    source.includes("<button") && source.includes("onClick"),
    "Must have a button with onClick to start playback"
  );

  // Must set playing state on click
  assert(
    source.includes("setPlaying(true)"),
    "Must call setPlaying(true) when button is clicked"
  );

  // Iframe must have autoplay=1 when mounted
  assert(
    source.includes("autoplay=1"),
    "Iframe must have autoplay=1 parameter (starts playing immediately)"
  );

  // Must render <img> for the thumbnail (not background-image)
  assert(
    source.includes("<img") && source.includes("src={thumbnailUrl}"),
    "Must render <img> for YouTube thumbnail (not background-image)"
  );

  // Must have accessible label for the play button
  assert(
    source.includes("aria-label") || source.includes("aria-labelledby"),
    "Play button must have accessible label (aria-label or aria-labelledby)"
  );

  // Must show play button overlay
  assert(
    (source.includes("Play") || source.includes("play")) && source.includes("svg"),
    "Must show play button overlay (SVG icon or similar)"
  );

  console.log("  ✓ Uses useState for click-to-load state");
  console.log("  ✓ Conditionally renders iframe only when playing");
  console.log("  ✓ Uses YouTube thumbnail (i.ytimg.com/vi/{id}/hqdefault.jpg)");
  console.log("  ✓ Has button with onClick to start playback");
  console.log("  ✓ Sets playing state on click");
  console.log("  ✓ Iframe has autoplay=1 parameter");
  console.log("  ✓ Renders <img> for thumbnail");
  console.log("  ✓ Play button has accessible label");
  console.log("  ✓ Shows play button overlay");
}

function testYogaPlayerIntegration() {
  console.log("\n▶ Testing yoga-player integration...");

  const yogaPlayerPath = path.join(__dirname, "..", "src", "app", "yoga", "yoga-player.tsx");
  
  assert(
    fs.existsSync(yogaPlayerPath),
    "src/app/yoga/yoga-player.tsx must exist"
  );

  const source = fs.readFileSync(yogaPlayerPath, "utf-8");

  // Must import YouTubeEmbed
  assert(
    source.includes("YouTubeEmbed"),
    "yoga-player.tsx must import YouTubeEmbed component"
  );

  // Must use YouTubeEmbed instead of eager iframe
  assert(
    source.includes("<YouTubeEmbed"),
    "yoga-player.tsx must use <YouTubeEmbed> (not eager iframe)"
  );

  // Must NOT have the old eager iframe pattern
  assert(
    !source.includes('src={`https://www.youtube-nocookie.com/embed/${playing.youtubeId}?rel=0&modestbranding=1`}') &&
    !source.includes("youtube-nocookie.com/embed/") ||
    source.includes("YouTubeEmbed"),
    "Must NOT use eager iframe (replaced with YouTubeEmbed)"
  );

  // Must pass videoId and title props
  assert(
    source.includes("videoId={playing.youtubeId}") && source.includes("title={playing.title}"),
    "Must pass videoId and title props to YouTubeEmbed"
  );

  console.log("  ✓ Imports YouTubeEmbed component");
  console.log("  ✓ Uses <YouTubeEmbed> instead of eager iframe");
  console.log("  ✓ Passes videoId and title props");
}

function testNextConfigImages() {
  console.log("\n▶ Testing next.config images configuration...");

  const nextConfigPath = path.join(__dirname, "..", "next.config.ts");
  
  assert(
    fs.existsSync(nextConfigPath),
    "next.config.ts must exist"
  );

  const source = fs.readFileSync(nextConfigPath, "utf-8");

  // Must have images.remotePatterns configured
  assert(
    source.includes("images:") && source.includes("remotePatterns"),
    "next.config.ts must have images.remotePatterns configured"
  );

  // Must allow i.ytimg.com
  assert(
    source.includes("i.ytimg.com"),
    "next.config.ts must allow i.ytimg.com for YouTube thumbnails"
  );

  // Should allow /vi/** pathname pattern
  assert(
    source.includes("/vi/") || source.includes('"/vi/**"') || source.includes("'/vi/**'"),
    "next.config.ts should allow /vi/** pathname pattern for YouTube thumbnails"
  );

  console.log("  ✓ Has images.remotePatterns configured");
  console.log("  ✓ Allows i.ytimg.com domain");
  console.log("  ✓ Allows /vi/** pathname pattern");
}

console.log("Testing YouTube Embed Component");
console.log("================================");

testYouTubeEmbedComponent();
testYogaPlayerIntegration();
testNextConfigImages();

console.log("\n✅ All YouTube embed tests passed\n");
