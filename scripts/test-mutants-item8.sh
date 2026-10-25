#!/bin/bash
set -e

echo "=== Item #8: Mutant Testing ==="
echo ""

# Mutant (a): Put exercise status updates back
echo "Mutant (a): Re-add exercise status updates to abandonSessionCore"
git apply << 'EOF'
diff --git a/src/lib/session/abandon-session-deps.ts b/src/lib/session/abandon-session-deps.ts
index abc..def 100644
--- a/src/lib/session/abandon-session-deps.ts
+++ b/src/lib/session/abandon-session-deps.ts
@@ -16,6 +16,16 @@ export type SessionExerciseRow = {
   }> | null;
 };
 
+export type ExerciseForUpdate = {
+  id: string;
+  planned_sets: number | null;
+  status: Database["public"]["Enums"]["exercise_status"];
+  session_sets: Array<{
+    id: string;
+    is_warmup_set: boolean;
+  }> | null;
+};
+
 export type AbandonSessionDeps = {
   loadExercises(sessionId: string): Promise<{ data: SessionExerciseRow[] | null; error: string | null }>;
   updateSession(id: string, patch: { status: Database["public"]["Enums"]["session_status"]; completed_at: string | null; duration_seconds: number | null }): Promise<{ error: string | null; updatedCount: number }>;
@@ -23,6 +33,8 @@ export type AbandonSessionDeps = {
   loadSessionMetadata(id: string): Promise<{ data: { started_at: string | null; user_id: string } | null; error: string | null }>;
   loadExercisesWithSets(sessionId: string): Promise<{ data: Array<{ rest_seconds: number | null; session_sets: Array<{ completed_at: string; is_warmup_set: boolean }> | null }> | null; error: string | null }>;
   loadTimezone(userId: string): Promise<{ data: { timezone: string | null } | null; error: string | null }>;
+  loadExercisesForUpdate(sessionId: string): Promise<{ data: ExerciseForUpdate[] | null; error: string | null }>;
+  updateExerciseStatus(id: string, status: Database["public"]["Enums"]["exercise_status"]): Promise<{ error: string | null }>;
   now?: () => string;
 };
 
diff --git a/src/lib/session/abandon-session.ts b/src/lib/session/abandon-session.ts
index abc..def 100644
--- a/src/lib/session/abandon-session.ts
+++ b/src/lib/session/abandon-session.ts
@@ -140,5 +140,22 @@ export async function abandonSessionCore(
     return { ok: true, data: { status: statusData.status } };
   }
 
+  // Mark pending exercises completed/skipped (MUTATION A)
+  const { data: exercisesForUpdate, error: exercisesError } = await deps.loadExercisesForUpdate(sessionId);
+  if (exercisesError) return { ok: false, error: exercisesError };
+
+  for (const exercise of exercisesForUpdate ?? []) {
+    if (exercise.status !== "pending") continue;
+
+    const completedSets = (exercise.session_sets ?? []).filter((s) => !s.is_warmup_set).length;
+    const newStatus = completedSets >= (exercise.planned_sets ?? 0) && completedSets > 0
+      ? "completed"
+      : "skipped";
+
+    const { error: updateError } = await deps.updateExerciseStatus(exercise.id, newStatus);
+    if (updateError) return { ok: false, error: updateError };
+  }
+
   return { ok: true, data: { status } };
 }
EOF

TZ=UTC npm run test:abandon-retry 2>&1 | grep -A2 "FAIL\|❌" | head -10 || echo "No failure found"
git restore src/

echo ""
echo "Mutant (b): Bypass stale duration cap"
# Will add next...
