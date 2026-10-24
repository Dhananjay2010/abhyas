"use client";

import { useState, useTransition, useMemo } from "react";
import { updateSessionDateTime } from "../actions";
import { utcToZonedDateTime, zonedDateTimeToUtc } from "@/lib/timezone";
import { localDateString } from "@/lib/dates";

interface EditSessionProps {
  sessionId: string;
  localDate: string;
  startedAt: string | null;
  completedAt: string | null;
  timezone: string;
  signupDate: string;
}

export function EditSession({ 
  sessionId, 
  localDate, 
  startedAt, 
  completedAt, 
  timezone,
  signupDate,
}: EditSessionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  // Convert UTC timestamps to member's timezone for display
  const startZoned = startedAt ? utcToZonedDateTime(startedAt, timezone) : null;
  const endZoned = completedAt ? utcToZonedDateTime(completedAt, timezone) : null;
  
  const [editedDate, setEditedDate] = useState(localDate);
  const [editedStartTime, setEditedStartTime] = useState(startZoned?.time || "");
  const [editedEndTime, setEditedEndTime] = useState(endZoned?.time || "");

  // Calculate date picker limits with useMemo
  const minDate = useMemo(() => {
    const signupLocalDate = utcToZonedDateTime(signupDate, timezone).date;
    return signupLocalDate;
  }, [signupDate, timezone]);

  const maxDate = useMemo(() => {
    return localDateString(timezone);
  }, [timezone]);

  const handleSave = () => {
    setError(null);
    
    // Validate times
    if (!editedStartTime || !editedEndTime || !editedDate) {
      setError("Please enter all fields");
      return;
    }
    
    // Parse times to compare
    const [startHour, startMin] = editedStartTime.split(":").map(Number);
    const [endHour, endMin] = editedEndTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Midnight-crossing fix: when end ≤ start, assume end is on the next day
    let durationMinutes: number;
    let endDate: string;
    
    if (endMinutes <= startMinutes) {
      // End is on the next calendar day
      durationMinutes = (24 * 60 - startMinutes) + endMinutes;
      // Calculate next day
      const dateParts = editedDate.split("-").map(Number);
      const nextDay = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + 1));
      endDate = nextDay.toISOString().slice(0, 10);
    } else {
      // Same day
      durationMinutes = endMinutes - startMinutes;
      endDate = editedDate;
    }
    
    if (durationMinutes > 600) { // 10 hours
      setError("Duration cannot exceed 10 hours");
      return;
    }

    startTransition(async () => {
      // Convert from member's timezone to UTC
      const newStartedAt = zonedDateTimeToUtc(editedDate, editedStartTime, timezone);
      const newCompletedAt = zonedDateTimeToUtc(endDate, editedEndTime, timezone);
      
      // Extract local date in member's timezone from the start time
      const startZonedDate = utcToZonedDateTime(newStartedAt, timezone).date;

      const result = await updateSessionDateTime(
        sessionId,
        startZonedDate,
        newStartedAt,
        newCompletedAt
      );

      if (result.success) {
        setIsEditing(false);
      } else if (result.error) {
        setError(result.error);
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
      {error && (
        <div className="mt-2 rounded bg-[rgb(var(--destructive-rgb)/0.1)] px-3 py-2 text-sm text-[rgb(var(--destructive-rgb))]">
          {error}
        </div>
      )}
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-xs text-muted">Date</label>
          <input
            type="date"
            value={editedDate}
            onChange={(e) => setEditedDate(e.target.value)}
            min={minDate}
            max={maxDate}
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
          onClick={() => {
            setIsEditing(false);
            setError(null);
          }}
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
