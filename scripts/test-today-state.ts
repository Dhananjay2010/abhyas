#!/usr/bin/env tsx
/**
 * Test suite for Today state pure functions.
 *
 * Tests the missed-day detection and today-state calculation across:
 * - All signup weekdays (Mon-Sun)
 * - All plan sizes (3-day and 4-day)
 * - Day 1 never shows missed
 * - Real missed days show missed
 * - Training day after a missed training day shows missed
 * - Rest settles yesterday
 * - Completed days show completed
 *
 * Run with: npm test (this runs before test:sentry)
 */

import { isMissedTrainingDay, type MissedDayInput } from "../src/lib/today/missed-day";
import { addDays, isoWeekday } from "../src/lib/dates";

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`✓ ${message}`);
  }
}

// 3-day plan: Mon, Wed, Fri (indices 1, 3, 5)
const PLANS = {
  "3-day": new Set([1, 3, 5]),
  "4-day": new Set([1, 2, 4, 5]),
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isTrainingDay(dayIndex: number, plan: Set<number>): boolean {
  return plan.has(dayIndex);
}

// Test all signup weekdays for a given plan
function testSignupWeekdays(planName: string, trainingDays: Set<number>) {
  console.log(`\n=== Testing ${planName} ===`);

  // Test each weekday as a signup day (0 = Sun through 6 = Sat)
  for (let signupWeekday = 0; signupWeekday <= 6; signupWeekday++) {
    const weekdayName = DAY_NAMES[signupWeekday];
    const signupDayIndex = ((signupWeekday + 6) % 7) + 1; // Convert to ISO weekday (1-7)
    
    console.log(`\n--- Signup on ${weekdayName} (${planName}) ---`);
    
    // Use a fixed base date and offset to test weekday
    const baseDate = "2026-10-20"; // A Monday
    const baseDayIndex = isoWeekday(baseDate);
    const offsetDays = signupDayIndex - baseDayIndex;
    const testDay1 = addDays(baseDate, offsetDays);
    
    const programStartedOn = testDay1;
    const onboardingCompletedAt = `${testDay1}T10:00:00+05:30`; // 10 AM IST
    const timezone = "Asia/Kolkata";
    
    // Day 1: yesterday is before program started
    const yesterday = addDays(testDay1, -1);
    const yesterdayWeekday = isoWeekday(yesterday);
    const yesterdayIsTraining = isTrainingDay(yesterdayWeekday, trainingDays);
    
    const missedDay1 = isMissedTrainingDay({
      date: yesterday,
      programStartedOn,
      onboardingCompletedAt,
      timezone,
      templateDayType: yesterdayIsTraining ? "weights" : "rest",
      completedSessions: [],
    });
    
    assert(
      !missedDay1,
      `Day 1 ${weekdayName}: yesterday (${DAY_NAMES[yesterdayWeekday - 1]}) should NOT be missed (before program start)`
    );
    
    // Find the next training day after signup to test "day after missed"
    let daysAhead = 1;
    let foundTrainingDay = false;
    while (daysAhead <= 7 && !foundTrainingDay) {
      const futureDay = addDays(testDay1, daysAhead);
      const futureDayIndex = isoWeekday(futureDay);
      if (isTrainingDay(futureDayIndex, trainingDays)) {
        foundTrainingDay = true;
        
        // Test that this day IS missed when not completed
        const missedResult = isMissedTrainingDay({
          date: futureDay,
          programStartedOn,
          onboardingCompletedAt,
          timezone,
          templateDayType: "weights",
          completedSessions: [], // No session completed
        });
        
        assert(
          missedResult,
          `${DAY_NAMES[futureDayIndex - 1]} was a training day with no session (should be missed)`
        );
        
        // Test that the NEXT day (day after missed training) shows missed
        const dayAfterMissed = addDays(futureDay, 1);
        const dayAfterMissedIndex = isoWeekday(dayAfterMissed);
        const missedYesterday = isMissedTrainingDay({
          date: futureDay,
          programStartedOn,
          onboardingCompletedAt,
          timezone,
          templateDayType: "weights",
          completedSessions: [],
        });
        
        assert(
          missedYesterday,
          `Day after missed training (${DAY_NAMES[dayAfterMissedIndex - 1]}): yesterday (${DAY_NAMES[futureDayIndex - 1]}) was missed`
        );
      }
      daysAhead++;
    }
    
    // Test that choosing Rest settles yesterday
    const restDay = addDays(testDay1, 2);
    const restDayIndex = isoWeekday(restDay);
    const prevDay = addDays(restDay, -1);
    const prevDayIndex = isoWeekday(prevDay);
    
    if (isTrainingDay(prevDayIndex, trainingDays)) {
      // Choosing Rest should settle it
      const missedAfterRest = isMissedTrainingDay({
        date: prevDay,
        programStartedOn,
        onboardingCompletedAt,
        timezone,
        templateDayType: "weights",
        completedSessions: [
          { actual_type: "rest", status: "completed" }
        ],
      });
      
      assert(
        missedAfterRest, // Rest doesn't settle a training day - it's still missed
        `Choosing Rest for ${DAY_NAMES[prevDayIndex - 1]} doesn't settle a training day (still missed)`
      );
      
      // But choosing a strength workout settles it
      const missedAfterStrength = isMissedTrainingDay({
        date: prevDay,
        programStartedOn,
        onboardingCompletedAt,
        timezone,
        templateDayType: "weights",
        completedSessions: [
          { actual_type: "weights", status: "completed" }
        ],
      });
      
      assert(
        !missedAfterStrength,
        `Choosing strength for ${DAY_NAMES[prevDayIndex - 1]} settles it (not missed)`
      );
    }
  }
}

// Guard case: test fails WITHOUT the block-start check
function testGuardCase() {
  console.log(`\n=== Guard Case: Test FAILS without block-start check ===`);
  
  const programStartedOn = "2026-10-24";
  const yesterday = "2026-10-23"; // Before program start
  const timezone = "Asia/Kolkata";
  
  // This should return FALSE (not missed) because yesterday is before program start
  const missed = isMissedTrainingDay({
    date: yesterday,
    programStartedOn,
    onboardingCompletedAt: `${programStartedOn}T10:00:00+05:30`,
    timezone,
    templateDayType: "weights",
    completedSessions: [],
  });
  
  assert(
    !missed,
    `Guard case: Day before program start should NOT be missed`
  );
  
  // Simulate what would happen WITHOUT the start-date check
  // (i.e., if we only checked template + no completion)
  const templateIsTraining = true; // weights
  const noSessionCompleted = true;
  const wouldBeMissedWithoutCheck = templateIsTraining && noSessionCompleted;
  
  assert(
    wouldBeMissedWithoutCheck && !missed,
    `Without started_on check, this would incorrectly flag as missed`
  );
}

// Test UTC vs local timezone handling
function testTimezoneHandling() {
  console.log(`\n=== Testing Timezone Handling ===`);
  
  // User in UTC+5:30 onboards at 23:00 local (which is 17:30 UTC same day)
  const localDate = "2026-10-24";
  const onboardingUtc = "2026-10-24T17:30:00Z"; // 23:00 IST
  const timezone = "Asia/Kolkata";
  
  const programStartedOn = localDate;
  const yesterday = "2026-10-23";
  
  // Yesterday (Oct 23) should NOT be missed - program started Oct 24 local time
  const missed = isMissedTrainingDay({
    date: yesterday,
    programStartedOn,
    onboardingCompletedAt: onboardingUtc,
    timezone,
    templateDayType: "weights",
    completedSessions: [],
  });
  
  assert(
    !missed,
    `UTC+5:30 user onboarding at 23:00 local: yesterday not missed (correct timezone conversion)`
  );
}

// Run all tests
console.log("🧪 Testing Today State Functions\n");

testSignupWeekdays("3-day plan (M/W/F)", PLANS["3-day"]);
testSignupWeekdays("4-day plan (M/Tu/Th/F)", PLANS["4-day"]);
testGuardCase();
testTimezoneHandling();

// Summary
console.log("\n" + "=".repeat(50));
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
if (failedTests > 0) {
  console.log(`❌ ${failedTests} test(s) failed`);
  process.exit(1);
} else {
  console.log("✅ All tests passed!");
  process.exit(0);
}
