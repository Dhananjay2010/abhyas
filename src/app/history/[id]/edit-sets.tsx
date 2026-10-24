"use client";

import { useState, useTransition } from "react";
import { updateSet } from "../actions";

interface SetData {
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean;
}

interface EditSetsProps {
  sessionId: string;
  exercises: Array<{
    id: string;
    name: string;
    sets: SetData[];
    metric: string;
  }>;
}

export function EditSets({ sessionId, exercises }: EditSetsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editedSets, setEditedSets] = useState<Map<string, SetData>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

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

    const numValue = value === "" ? null : parseFloat(value);
    
    // Validation
    const newErrors = new Map(errors);
    if (numValue !== null) {
      if (isNaN(numValue)) {
        newErrors.set(`${key}-${field}`, "Must be a number");
      } else if (numValue < 0) {
        newErrors.set(`${key}-${field}`, "Must be positive");
      } else if (field === "reps" && numValue > 999) {
        newErrors.set(`${key}-${field}`, "Maximum 999 reps");
      } else if (field === "weight_kg" && numValue > 9999) {
        newErrors.set(`${key}-${field}`, "Maximum 9999 kg");
      } else if (field === "duration_seconds" && numValue > 3600) {
        newErrors.set(`${key}-${field}`, "Maximum 1 hour");
      } else {
        newErrors.delete(`${key}-${field}`);
      }
    } else {
      newErrors.delete(`${key}-${field}`);
    }
    setErrors(newErrors);

    const updatedSet = { ...currentSet, [field]: numValue };
    setEditedSets(new Map(editedSets.set(key, updatedSet)));
  };

  const handleSave = () => {
    if (errors.size > 0) {
      return;
    }

    startTransition(async () => {
      const updates: Promise<{ success?: boolean; error?: string }>[] = [];

      for (const [key, set] of editedSets) {
        updates.push(
          updateSet(
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
        alert(`Failed to update ${failed.length} set(s)`);
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
                          step="1"
                          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                        />
                        {errors.has(`${key}-duration_seconds`) && (
                          <p className="mt-0.5 text-xs text-destructive">
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
                            min="0"
                            step="1"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                          />
                          {errors.has(`${key}-reps`) && (
                            <p className="mt-0.5 text-xs text-destructive">
                              {errors.get(`${key}-reps`)}
                            </p>
                          )}
                        </div>
                        <div className="flex-1">
                          <input
                            type="number"
                            value={editedSet.weight_kg ?? ""}
                            onChange={(e) =>
                              handleSetChange(
                                set.session_exercise_id,
                                set.set_number,
                                "weight_kg",
                                e.target.value
                              )
                            }
                            placeholder="kg"
                            min="0"
                            step="0.5"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                          />
                          {errors.has(`${key}-weight_kg`) && (
                            <p className="mt-0.5 text-xs text-destructive">
                              {errors.get(`${key}-weight_kg`)}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => {
            setIsEditing(false);
            setEditedSets(new Map());
            setErrors(new Map());
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
