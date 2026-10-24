# Exercise History API

Read-only data layer for querying a user's past performance on exercises.

## Quick Start

```typescript
import { 
  getLastPerformance, 
  getBatchLastPerformance,
  getExerciseHistory 
} from "@/lib/exercise-history";

// Show "last time" in the session runner
const lastTime = await getLastPerformance(supabase, userId, exerciseId);
if (lastTime) {
  console.log(`Last time: ${lastTime.topSet.reps}×${lastTime.topSet.weight_kg}kg on ${lastTime.date}`);
}

// Batch lookup for multiple exercises
const exerciseIds = ["ex1", "ex2", "ex3"];
const lastPerformances = await getBatchLastPerformance(supabase, userId, exerciseIds);

// Full history with PRs for Progress page
const history = await getExerciseHistory(supabase, userId, exerciseId, { limit: 20 });
```

## Main Functions

### `getLastPerformance(supabase, userId, exerciseId)`

Returns the most recent completed performance of an exercise.

**Returns:** `LastPerformance | null`

```typescript
interface LastPerformance {
  date: string;           // yyyy-mm-dd
  sessionId: string;
  sets: SetData[];        // All working sets (warmups excluded)
  topSet: SetData | null; // Best set (highest 1RM for weighted, most reps for bodyweight)
  volumeKg: number;       // Total volume (0 for bodyweight/timed)
  estimatedOneRepMax: number | null; // Epley 1RM from top set
  metric: "reps" | "seconds";
}
```

**Example rendering "last time":**

```typescript
const lastTime = await getLastPerformance(supabase, userId, exerciseId);
if (lastTime && lastTime.topSet) {
  const { reps, weight_kg } = lastTime.topSet;
  
  // Weighted: "last time: 9×5kg"
  if (weight_kg && weight_kg > 0) {
    return `last time: ${reps}×${weight_kg}kg`;
  }
  
  // Bodyweight: "last time: 12 reps"
  if (reps) {
    return `last time: ${reps} reps`;
  }
  
  // Time-based: "last time: 60s"
  if (lastTime.topSet.duration_seconds) {
    return `last time: ${lastTime.topSet.duration_seconds}s`;
  }
}
```

### `getBatchLastPerformance(supabase, userId, exerciseIds[])`

More efficient variant when you need "last time" for many exercises at once.

**Returns:** `Map<exerciseId, LastPerformance>`

```typescript
const exerciseIds = session.exercises.map(e => e.id);
const lastPerformances = await getBatchLastPerformance(supabase, userId, exerciseIds);

session.exercises.forEach(exercise => {
  const lastTime = lastPerformances.get(exercise.id);
  if (lastTime) {
    // Show "last time" hint
  }
});
```

### `getExerciseHistory(supabase, userId, exerciseId, options)`

Get complete history of an exercise with PR detection.

**Options:**
- `limit?: number` - Sessions per page (default: 10)
- `offset?: number` - For pagination (default: 0)

**Returns:** `ExerciseHistory`

```typescript
interface ExerciseHistory {
  sessions: ExerciseHistorySession[]; // Newest first
  totalCount: number;                  // Total sessions (for pagination)
  currentPRs: PersonalRecord[];        // Current PRs across all history
}

interface ExerciseHistorySession {
  sessionId: string;
  date: string;
  sets: SetData[];
  topSet: SetData | null;
  volumeKg: number;
  estimatedOneRepMax: number | null;
  prs: PersonalRecord[];  // PRs achieved in THIS session (at the time)
}
```

**Example History page:**

```typescript
const history = await getExerciseHistory(supabase, userId, exerciseId, { 
  limit: 10, 
  offset: 0 
});

// Show current PRs at the top
history.currentPRs.forEach(pr => {
  console.log(`${pr.type}: ${pr.value} (${pr.set.reps}×${pr.set.weight_kg}kg)`);
});

// List sessions with PR badges
history.sessions.forEach(session => {
  console.log(`${session.date}: ${session.volumeKg}kg, ${session.sets.length} sets`);
  
  if (session.prs.length > 0) {
    console.log(`  🏆 PRs: ${session.prs.map(pr => pr.type).join(", ")}`);
  }
});
```

## Pure Functions (for testing/UI logic)

### `calculateEpley1RM(reps, weightKg)`

Estimate 1RM using Epley formula: `weight × (1 + reps/30)`

Returns `null` for bodyweight (weight ≤ 0) or invalid inputs.

### `findTopSet(sets, metric)`

Find the best set from a list:
- **Weighted**: Highest estimated 1RM
- **Bodyweight**: Most reps
- **Time-based**: Longest duration

### `detectPersonalRecords(allSets, metric)`

Detect current PRs from complete exercise history:
- **Weighted**: `heaviest_weight`, `best_e1rm`, `most_reps`
- **Bodyweight**: `most_reps`
- **Time-based**: `longest_duration`

### `detectSetPRs(sets, setIndex, metric)`

Check if a specific set (at `setIndex` in `sets`) achieved any PRs compared to all previous sets.

Returns array of `PRType[]` achieved by that set.

## PR Types

```typescript
type PRType = 
  | "heaviest_weight"   // Highest weight lifted (any reps)
  | "most_reps"         // Most reps in a single set (at any weight)
  | "best_e1rm"         // Best estimated 1RM
  | "longest_duration"; // Longest duration (time-based exercises)

interface PersonalRecord {
  type: PRType;
  set: SetData;
  value: number;  // The PR value (kg, reps, or seconds)
  e1rm?: number;  // Estimated 1RM when applicable
}
```

## Notes

- **Read-only**: No mutations. This layer only queries history.
- **Timezone-aware**: Dates use user's timezone via `resolveTimezoneWithProfile`.
- **Warmup sets excluded**: Only working sets are included in calculations.
- **Bodyweight handling**: Zero or null weight is treated as bodyweight.
- **Unit consistency**: All weights in kg, all durations in seconds.
- **PR detection**: Real-time as sets are logged (use `detectSetPRs`) and historical (use `detectPersonalRecords`).

## Testing

Pure functions are separated from queries for easy unit testing:

```typescript
import { calculateEpley1RM, findTopSet } from "@/lib/exercise-history";

// Test pure functions without DB
const e1rm = calculateEpley1RM(8, 100); // 126.67kg
const topSet = findTopSet([
  { reps: 8, weight_kg: 100 },
  { reps: 10, weight_kg: 90 },
], "reps");
```
