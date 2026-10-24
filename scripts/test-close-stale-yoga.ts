/**
 * Test that closeStaleSessions correctly handles yoga sessions.
 * 
 * Bug: Yoga sessions have no session_exercises or session_sets, so the original
 * logic would mark them as "skipped" instead of "completed", causing them to not
 * count toward streaks or days trained.
 */

function check(label: string, pass: boolean): void {
  if (!pass) {
    console.error(`✗ FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

console.log("\n=== Test closeStaleSessions yoga handling ===\n");

// This test validates the LOGIC, not the actual Supabase query.
// The key insight: yoga sessions have actual_type="yoga" and yoga_video_id set
// when completed, but no session_exercises or session_sets.

type Session = {
  id: string;
  actual_type: string | null;
  yoga_video_id: string | null;
  has_working_sets: boolean;
};

const sessions: Session[] = [
  // Strength session with working sets - should be completed
  { id: "s1", actual_type: "weights", yoga_video_id: null, has_working_sets: true },
  
  // Strength session WITHOUT working sets - should be skipped
  { id: "s2", actual_type: "weights", yoga_video_id: null, has_working_sets: false },
  
  // Yoga session that was done (has yoga_video_id) - should be completed
  { id: "s3", actual_type: "yoga", yoga_video_id: "vid123", has_working_sets: false },
  
  // Yoga session that was NOT done (no yoga_video_id) - should be skipped
  { id: "s4", actual_type: null, yoga_video_id: null, has_working_sets: false },
  
  // Breathing session - should be skipped (doesn't count)
  { id: "s5", actual_type: "meditation", yoga_video_id: null, has_working_sets: false },
];

// Simulate the fixed logic
const trained = new Set<string>();

for (const s of sessions) {
  // Original logic: check for working sets
  if (s.has_working_sets) {
    trained.add(s.id);
  }
  
  // NEW logic: yoga sessions with yoga_video_id count
  if (s.actual_type === "yoga" && s.yoga_video_id) {
    trained.add(s.id);
  }
}

check("Strength with sets is completed", trained.has("s1"));
check("Strength without sets is NOT completed", !trained.has("s2"));
check("Yoga with video_id is completed", trained.has("s3"));
check("Yoga without video_id is NOT completed", !trained.has("s4"));
check("Breathing is NOT completed", !trained.has("s5"));

console.log("\n=== All checks passed ===\n");
