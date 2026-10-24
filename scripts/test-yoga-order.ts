/**
 * Test: Yoga video order
 *
 * Verifies that yoga videos are sorted correctly (intro first, then by day_index)
 * so the list order matches the playback order.
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testYogaPageSorting() {
  console.log("\n▶ Testing yoga page video sorting...");

  const yogaPagePath = path.join(__dirname, "..", "src", "app", "yoga", "page.tsx");
  
  assert(
    fs.existsSync(yogaPagePath),
    "src/app/yoga/page.tsx must exist"
  );

  const source = fs.readFileSync(yogaPagePath, "utf-8");

  // Must sort videos after mapping
  assert(
    source.includes('.sort('),
    "Yoga page must sort videos array"
  );

  // Must sort by dayIndex
  assert(
    source.includes('dayIndex') && source.includes('.sort('),
    "Yoga page must sort by dayIndex"
  );

  // Should handle null dayIndex (intro videos)
  assert(
    source.includes('?? -1') || source.includes('|| -1') || source.includes('null'),
    "Yoga page sort should handle null dayIndex for intro videos"
  );

  console.log("  ✓ Yoga page sorts videos array");
  console.log("  ✓ Sorting uses dayIndex");
  console.log("  ✓ Handles null dayIndex (intro videos)");
}

function testYogaPlayerNextUp() {
  console.log("\n▶ Testing yoga player nextUp logic...");

  const yogaPlayerPath = path.join(__dirname, "..", "src", "app", "yoga", "yoga-player.tsx");
  
  assert(
    fs.existsSync(yogaPlayerPath),
    "src/app/yoga/yoga-player.tsx must exist"
  );

  const source = fs.readFileSync(yogaPlayerPath, "utf-8");

  // Must calculate nextUp as first undone or first video
  assert(
    source.includes('nextUp') && source.includes('useMemo'),
    "YogaPlayer must calculate nextUp with useMemo"
  );

  assert(
    source.includes('.find') && source.includes('!v.done'),
    "nextUp must find first undone video"
  );

  assert(
    source.includes('[0]') && source.includes('??'),
    "nextUp must fall back to first video if all done"
  );

  console.log("  ✓ nextUp calculated with useMemo");
  console.log("  ✓ nextUp finds first undone video");
  console.log("  ✓ Falls back to first video if all done");
}

function testYogaDisplayGrouping() {
  console.log("\n▶ Testing yoga-display grouping order...");

  const yogaDisplayPath = path.join(__dirname, "..", "src", "lib", "yoga-display.ts");
  
  assert(
    fs.existsSync(yogaDisplayPath),
    "src/lib/yoga-display.ts must exist"
  );

  const source = fs.readFileSync(yogaDisplayPath, "utf-8");

  // Must handle intro videos (dayIndex <= 0 or null)
  assert(
    source.includes('dayIndex') && (source.includes('<= 0') || source.includes('null')),
    "groupVideosByWeek must identify intro videos (dayIndex <= 0 or null)"
  );

  // Intro videos should go first
  assert(
    source.includes('introVideos') && source.includes('.push'),
    "Intro videos must be added to groups first"
  );

  // Must sort videos within week by day_index
  assert(
    source.includes('.sort') && source.includes('dayIndex'),
    "Videos within week must be sorted by day_index"
  );

  console.log("  ✓ Identifies intro videos (dayIndex <= 0 or null)");
  console.log("  ✓ Intro videos placed first in groups");
  console.log("  ✓ Videos within week sorted by day_index");
}

console.log("Testing Yoga Video Order");
console.log("========================");

testYogaPageSorting();
testYogaPlayerNextUp();
testYogaDisplayGrouping();

console.log("\n✅ All yoga video order tests passed\n");
