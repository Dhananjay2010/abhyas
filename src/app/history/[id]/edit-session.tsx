"use client";

import { useState, useTransition } from "react";
import { updateSessionDateTime } from "../actions";

interface EditSessionProps {
  sessionId: string;
  localDate: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function EditSession({ sessionId, localDate, startedAt, completedAt }: EditSessionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editedDate, setEditedDate] = useState(localDate);
  const [editedStartTime, setEditedStartTime] = useState(
    startedAt ? new Date(startedAt).toISOString().slice(11, 16) : ""
  );
  const [editedEndTime, setEditedEndTime] = useState(
    completedAt ? new Date(completedAt).toISOString().slice(11, 16) : ""
  );

  const handleSave = () => {
    startTransition(async () => {
      // Construct new ISO timestamps if times are provided
      let newStartedAt = startedAt;
      let newCompletedAt = completedAt;

      if (editedStartTime && editedDate) {
        newStartedAt = `${editedDate}T${editedStartTime}:00Z`;
      }
      if (editedEndTime && editedDate) {
        newCompletedAt = `${editedDate}T${editedEndTime}:00Z`;
      }

      const result = await updateSessionDateTime(
        sessionId,
        editedDate,
        newStartedAt,
        newCompletedAt
      );

      if (result.success) {
        setIsEditing(false);
      }
    });
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="mt-4 text-sm text-accent underline underline-offset-2"
      >
        Edit date/time
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">Edit Session</h3>
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-xs text-muted">Date</label>
          <input
            type="date"
            value={editedDate}
            onChange={(e) => setEditedDate(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Start Time</label>
          <input
            type="time"
            value={editedStartTime}
            onChange={(e) => setEditedStartTime(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted">End Time</label>
          <input
            type="time"
            value={editedEndTime}
            onChange={(e) => setEditedEndTime(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setIsEditing(false)}
          disabled={isPending}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-muted/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
