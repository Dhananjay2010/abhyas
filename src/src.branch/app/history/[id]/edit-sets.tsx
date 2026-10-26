"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSet, deleteSet } from "../actions";
import { kgToDisplay, weightLabel, roundLbToHalf, convertWeightInputToKg, LOAD_IMPERIAL_MAX_LB, LOAD_METRIC_MAX_KG, type UnitsPreference } from "@/lib/units";

interface SetData {
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean;
}

interface EditSetsProps {
  units: UnitsPreference;
  exercises: Array<{
    id: string;
    name: string;
    sets: SetData[];
    metric: string;
  }>;
  saveSet?: typeof updateSet;
}

export function EditSets({ units, exercises, saveSet = updateSet }: EditSetsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editedSets, setEditedSets] = useState<Map<string, SetData>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [setToDelete, setSetToDelete] = useState<{ exerciseId: string; setNumber: number } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [deletedSet, setDeletedSet] = useState<{ exerciseId: string; setNumber: number } | null>(null);
  const [showLastSetConfirm, setShowLastSetConfirm] = useState<{ exerciseId: string; setNumber: number } | null>(null);

  const handleEdit = () => {
    // Initialize edited sets with current values
    const initialSets = new Map<string, SetData>();
    for (const exercise of exercises) {
      for (const set of exercise.sets.filter((s) => !s.is_warmup_set)) {
        const key = `${set.session_exercise_id}-${set.set_number}`;
        initialSets.set(key, { ...set });
      }
    }
    setEditedSets(initialSets);
    setIsEditing(true);
  };

  const handleSetChange = (
    sessionExerciseId: string,
    setNumber: number,
    field: "reps" | "weight_kg" | "duration_seconds",
    value: string
  ) => {
    const key = `${sessionExerciseId}-${setNumber}`;
    const currentSet = editedSets.get(key);
    if (!currentSet) return;

    let numValue = value === "" ? null : parseFloat(value);
    
    // Validation (before conversion for weight)
    const newErrors = new Map(errors);
    if (numValue !== null) {
      if (isNaN(numValue)) {
        newErrors.set(`${key}-${field}`, "Must be a number");
      } else if (numValue < 0) {
        newErrors.set(`${key}-${field}`, "Must be positive");
      } else if (field === "reps" && numValue > 100) {
        newErrors.set(`${key}-${field}`, "Maximum 100 reps");
      } else if (field === "weight_kg") {
        const maxDisplay = units === "imperial" ? LOAD_IMPERIAL_MAX_LB : LOAD_METRIC_MAX_KG;
        if (numValue > maxDisplay) {
          newErrors.set(`${key}-${field}`, `Maximum ${units === "imperial" ? `${LOAD_IMPERIAL_MAX_LB} lb` : `${LOAD_METRIC_MAX_KG} kg`}`);
        } else {
          newErrors.delete(`${key}-${field}`);
        }
      } else if (field === "duration_seconds" && numValue > 3600) {
        newErrors.set(`${key}-${field}`, "Maximum 1 hour");
      } else {
        newErrors.delete(`${key}-${field}`);
      }
    } else {
      newErrors.delete(`${key}-${field}`);
    }
    setErrors(newErrors);
    
    // Convert display units to kg for weight field (after validation)
    if (field === "weight_kg" && numValue !== null) {
      numValue = convertWeightInputToKg(numValue, units);
    }

    const updatedSet = { ...currentSet, [field]: numValue };
    setEditedSets(new Map(editedSets.set(key, updatedSet)));
  };

  const handleDeleteClick = (sessionExerciseId: string, setNumber: number) => {
    // Count total working sets
    let totalWorkingSets = 0;
    for (const exercise of exercises) {
      totalWorkingSets += exercise.sets.filter(s => !s.is_warmup_set).length;
    }

    // If this is the last set, show special confirmation
    if (totalWorkingSets === 1) {
      setShowLastSetConfirm({ exerciseId: sessionExerciseId, setNumber });
    } else {
      setSetToDelete({ exerciseId: sessionExerciseId, setNumber });
    }
  };

  const confirmDelete = () => {
    if (!setToDelete) return;

    startTransition(async () => {
      const result = await deleteSet(setToDelete.exerciseId, setToDelete.setNumber, false);
      
      if (result.success) {
        setDeletedSet(setToDelete);
        setShowUndo(true);
        setSetToDelete(null);
        
        // Hide undo after 5 seconds
        setTimeout(() => setShowUndo(false), 5000);
      } else if (result.error) {
        if (result.error === "last_set") {
          // Should not happen as we check before, but handle it
          setShowLastSetConfirm(setToDelete);
          setSetToDelete(null);
        } else {
          setGlobalError(result.error);
          setSetToDelete(null);
        }
      }
    });
  };

  const confirmDeleteLastSet = () => {
    if (!showLastSetConfirm) return;

    startTransition(async () => {
      const result = await deleteSet(
        showLastSetConfirm.exerciseId,
        showLastSetConfirm.setNumber,
        true
      );
      
      if (result.success) {
        if (result.sessionDeleted && result.redirect) {
          router.push(result.redirect);
        }
      } else if (result.error) {
        setGlobalError(result.error);
        setShowLastSetConfirm(null);
      }
    });
  };

  const cancelDelete = () => {
    setSetToDelete(null);
  };

  const cancelLastSetConfirm = () => {
    setShowLastSetConfirm(null);
  };

  const handleSave = () => {
    if (errors.size > 0) {
      return;
    }

    setGlobalError(null);

    startTransition(async () => {
      const updates: Promise<{ success?: boolean; error?: string }>[] = [];

      for (const [, set] of editedSets) {
        updates.push(
          saveSet(
            set.session_exercise_id,
            set.set_number,
            set.reps,
            set.weight_kg,
            set.duration_seconds
          )
        );
      }

      const results = await Promise.all(updates);
      const failed = results.filter((r) => r.error);

      if (failed.length === 0) {
        setIsEditing(false);
        setEditedSets(new Map());
      } else {
        setGlobalError(`Failed to update ${failed.length} set(s). ${failed[0]?.error || ""}`);
      }
    });
  };

  if (!isEditing) {
    return (
      <button
        onClick={handleEdit}
        className="mt-4 text-sm text-accent underline underline-offset-2"
      >
        Edit sets
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">Edit Sets</h3>
      <p className="mt-1 text-xs text-muted">
        Editing sets recalculates PR status. Empty fields will be saved as blank.
      </p>

      {globalError && (
        <div className="mt-3 rounded bg-[rgb(var(--destructive-rgb)/0.1)] px-3 py-2 text-sm text-[rgb(var(--destructive-rgb))]">
          {globalError}
        </div>
      )}

      <div className="mt-4 max-h-96 space-y-4 overflow-y-auto">
        {exercises.map((exercise) => {
          const workingSets = exercise.sets.filter((s) => !s.is_warmup_set);
          if (workingSets.length === 0) return null;

          const isTimed = exercise.metric === "seconds";

          return (
            <div key={exercise.id} className="space-y-2">
              <h4 className="text-sm font-semibold">{exercise.name}</h4>
              {workingSets.map((set) => {
                const key = `${set.session_exercise_id}-${set.set_number}`;
                const editedSet = editedSets.get(key);
                if (!editedSet) return null;

                return (
                  <div key={key} className="flex items-start gap-2">
                    <span className="mt-2 shrink-0 text-xs text-muted">Set {set.set_number}</span>
                    
                    {isTimed ? (
                      <div className="flex-1">
                        <input
                          type="number"
                          value={editedSet.duration_seconds ?? ""}
                          onChange={(e) =>
                            handleSetChange(
                              set.session_exercise_id,
                              set.set_number,
                              "duration_seconds",
                              e.target.value
                            )
                          }
                          placeholder="seconds"
                          min="0"
                          max="3600"
                          step="1"
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                        {errors.has(`${key}-duration_seconds`) && (
                          <p className="mt-0.5 text-xs text-[rgb(var(--destructive-rgb))]">
                            {errors.get(`${key}-duration_seconds`)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <input
                            type="number"
                            value={editedSet.reps ?? ""}
                            onChange={(e) =>
                              handleSetChange(
                                set.session_exercise_id,
                                set.set_number,
                                "reps",
                                e.target.value
                              )
                            }
                            placeholder="reps"
                            min="1"
                            max="100"
                            step="1"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                          />
                          {errors.has(`${key}-reps`) && (
                            <p className="mt-0.5 text-xs text-[rgb(var(--destructive-rgb))]">
                              {errors.get(`${key}-reps`)}
                            </p>
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            type="number"
                            value={
                              editedSet.weight_kg !== null
                                ? units === "imperial"
                                  ? roundLbToHalf(kgToDisplay(editedSet.weight_kg, units))
                                  : kgToDisplay(editedSet.weight_kg, units)
                                : ""
                            }
                            onChange={(e) =>
                              handleSetChange(
                                set.session_exercise_id,
                                set.set_number,
                                "weight_kg",
                                e.target.value
                              )
                            }
                            placeholder={weightLabel(units)}
                            min="0"
                            max={units === "imperial" ? LOAD_IMPERIAL_MAX_LB : LOAD_METRIC_MAX_KG}
                            step="0.5"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                          />
                          {errors.has(`${key}-weight_kg`) && (
                            <p className="mt-0.5 text-xs text-[rgb(var(--destructive-rgb))]">
                              {errors.get(`${key}-weight_kg`)}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    
                    {/* Delete button with 44px tap target */}
                    <button
                      onClick={() => handleDeleteClick(set.session_exercise_id, set.set_number)}
                      disabled={isPending}
                      className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border bg-background text-destructive transition-colors hover:border-destructive hover:bg-destructive/5 disabled:opacity-50"
                      aria-label="Delete set"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      {setToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Delete set?</h3>
            <p className="mt-2 text-sm text-muted">
              This will remove the set and update volume, PR status, and streak eligibility.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={cancelDelete}
                disabled={isPending}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isPending}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Last set confirmation dialog */}
      {showLastSetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Delete session?</h3>
            <p className="mt-2 text-sm text-muted">
              This is the last set. Delete the whole session?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={cancelLastSetConfirm}
                disabled={isPending}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteLastSet}
                disabled={isPending}
                className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete session"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {showUndo && deletedSet && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-3 shadow-xl">
          <p className="text-sm">
            Set deleted.{" "}
            <span className="text-muted">
              Volume, PR status, and streak updated.
            </span>
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => {
            setIsEditing(false);
            setEditedSets(new Map());
            setErrors(new Map());
            setGlobalError(null);
          }}
          disabled={isPending}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-muted/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending || errors.size > 0}
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
