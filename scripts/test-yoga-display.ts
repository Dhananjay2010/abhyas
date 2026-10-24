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
  "Intro | BREATH - A 30 Day Yoga Journey",
  "Intro",
  "Strips any series suffix with pipe"
);

testStrip(
  "Welcome | Yoga With Adriene",
  "Welcome",
  "Strips series author name suffix"
);

console.log("\nTesting groupVideosByWeek()...\n");

const sampleVideos: YogaVideoForGrouping[] = [
  { id: "1", title: "Day 1", dayIndex: 1, done: false },
  { id: "2", title: "Day 7", dayIndex: 7, done: false },
  { id: "3", title: "Day 8", dayIndex: 8, done: false },
  { id: "4", title: "Day 14", dayIndex: 14, done: false },
  { id: "5", title: "Random", dayIndex: null, done: false },
];

testGrouping(
  sampleVideos,
  3,
  "Introduction",
  "Groups videos into weeks with intro first"
);

testGrouping(
  [{ id: "1", title: "Random", dayIndex: null, done: false }],
  1,
  "Introduction",
  "Handles videos without day_index as Introduction"
);

testGrouping([], 0, "", "Handles empty video list");

const week1Only: YogaVideoForGrouping[] = [
  { id: "1", title: "Day 1", dayIndex: 1, done: false },
  { id: "2", title: "Day 7", dayIndex: 7, done: false },
];

testGrouping(week1Only, 1, "Week 1 (Day 1–7)", "Single week grouping (Day 1-7)");

const weekBoundary: YogaVideoForGrouping[] = [
  { id: "1", title: "Day 7", dayIndex: 7, done: false },
  { id: "2", title: "Day 8", dayIndex: 8, done: false },
];

testGrouping(weekBoundary, 2, "Week 1 (Day 7–7)", "Week boundary: Day 7 is Week 1, Day 8 is Week 2");

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
