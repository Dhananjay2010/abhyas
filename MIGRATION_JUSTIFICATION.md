# Migration 20261025000030: weight_at_failure_start_kg

## Why a new column is necessary

The `exercise_progress` table (before this migration) contains:

| Column                       | Purpose                                      | Why it can't hold pre-miss weight              |
|------------------------------|----------------------------------------------|------------------------------------------------|
| `user_id`                    | Foreign key to users                         | Not a weight field                             |
| `exercise_id`                | Foreign key to exercises                     | Not a weight field                             |
| `current_working_weight_kg`  | Current weight after latest decision         | **Holds 37.5 kg after first miss drops from 40 kg** |
| `current_target_reps`        | Current rep target                           | Not a weight field                             |
| `consecutive_failures`       | Count of consecutive misses (0, 1, 2, ...)  | Not a weight field                             |
| `last_performed_on`          | Date of last session                         | Not a weight field                             |
| `best_weight_kg`             | Lifetime best weight ever achieved           | **Holds lifetime max (e.g., 60 kg), not the pre-miss 40 kg** |
| `best_reps`                  | Reps achieved at best weight                 | Not a weight field                             |
| `best_e1rm`                  | Estimated 1RM from best performance          | Not a weight field                             |
| `total_sessions`             | Total sessions completed                     | Not a weight field                             |
| `updated_at`                 | Last update timestamp                        | Not a weight field                             |

## The problem

**M1 (stacked drops fix)** requires:
- First miss (consecutive_failures 0→1): drop 1 grid step from 40 kg → 37.5 kg, **store 40 kg**
- Second miss (consecutive_failures 1→2): back off 10% from **the stored 40 kg** (not from the dropped 37.5 kg)

After the first miss:
- `current_working_weight_kg` = 37.5 (the dropped weight)
- `best_weight_kg` = 60 (lifetime max, unchanged)
- **No existing column holds 40 kg** (the weight when failures went from 0 to 1)

## The solution

Add `weight_at_failure_start_kg numeric(6,2)` to store the original working weight when `consecutive_failures` goes from 0 to 1.

- **Idempotent**: uses `ADD COLUMN IF NOT EXISTS`
- **Nullable**: existing rows have `NULL` (handled by fallback logic: if `NULL`, back off from `current_working_weight_kg` instead)
- **No backfill needed**: mid-failure rows will fall back to current weight on next session (safe, already dropped once)

## Fallback behavior when NULL

If a mid-failure row has `weight_at_failure_start_kg = NULL` (legacy or in-flight session before migration):
1. `computeTwoMissResult` uses `currentWeight` as the back-off base instead
2. Still snaps DOWN (`Math.floor`) to grid
3. Still clamps to never exceed `currentWeight`
4. Test coverage: added in `scripts/test-m1-null-premiss-fallback.ts`
