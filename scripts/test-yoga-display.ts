import { stripSeriesSuffix, groupVideosByWeek, type YogaVideoForGrouping } from "../src/lib/yoga-display";

let failures = 0;

function testStrip(input: string, expected: string, description: string) {
  const actual = stripSeriesSuffix(input);
  if (actual !== expected) {
    console.error(`❌ ${description}`);
    console.error(`   input:    "${input}"`);
    console.error(`   expected: "${expected}"`);
    console.error(`   actual:   "${actual}"`);
    failures++;
  } else {
    console.log(`✓ ${description}`);
  }
}

function testGrouping(
  videos: YogaVideoForGrouping[],
  expectedGroupCount: number,
  expectedFirstLabel: string,
  description: string
) {
  const groups = groupVideosByWeek(videos);
  if (groups.length !== expectedGroupCount) {
    console.error(`❌ ${description} - wrong group count`);
    console.error(`   expected: ${expectedGroupCount} groups`);
    console.error(`   actual:   ${groups.length} groups`);
    failures++;
    return;
  }
  if (groups.length > 0 && groups[0].label !== expectedFirstLabel) {
    console.error(`❌ ${description} - wrong first label`);
    console.error(`   expected: "${expectedFirstLabel}"`);
    console.error(`   actual:   "${groups[0].label}"`);
    failures++;
    return;
  }
  console.log(`✓ ${description}`);
}

console.log("Testing stripSeriesSuffix()...\n");

testStrip(
  "Home - Day 0 - Welcome Home | 30 Days of Yoga",
  "Home - Day 0 - Welcome Home",
  "Strips standard series suffix"
);

testStrip(
  "Basic Yoga Practice | 30 Days of Yoga",
  "Basic Yoga Practice",
  "Strips suffix without day number"
);

testStrip(
  "Morning Flow",
  "Morning Flow",
  "Leaves titles without suffix unchanged"
);

testStrip(
  "Yoga for Athletes | 7 Days of Yoga",
  "Yoga for Athletes",
  "Strips suffix with different day count"
);

testStrip(
  "Title | 1 Day of Yoga",
  "Title",
  "Strips singular 'Day'"
);

testStrip(
  "Title | Something Else",
  "Title | Something Else",
  "Preserves pipe separator for non-matching patterns"
);

console.log("\nTesting groupVideosByWeek()...\n");

const sampleVideos: YogaVideoForGrouping[] = [
  { id: "1", title: "Day 0", dayIndex: 0, done: false },
  { id: "2", title: "Day 1", dayIndex: 1, done: false },
  { id: "3", title: "Day 7", dayIndex: 7, done: false },
  { id: "4", title: "Day 8", dayIndex: 8, done: false },
  { id: "5", title: "Day 14", dayIndex: 14, done: false },
  { id: "6", title: "Random", dayIndex: null, done: false },
];

testGrouping(
  sampleVideos,
  4,
  "Week 1 (Day 0–1)",
  "Groups videos into weeks correctly"
);

testGrouping(
  [{ id: "1", title: "Random", dayIndex: null, done: false }],
  1,
  "Other videos",
  "Handles videos without day_index"
);

testGrouping([], 0, "", "Handles empty video list");

const week1Only: YogaVideoForGrouping[] = [
  { id: "1", title: "Day 0", dayIndex: 0, done: false },
  { id: "2", title: "Day 6", dayIndex: 6, done: false },
];

testGrouping(week1Only, 1, "Week 1 (Day 0–6)", "Single week grouping");

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
