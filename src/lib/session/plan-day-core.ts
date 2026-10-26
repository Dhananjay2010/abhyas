import type { Database } from "@/lib/database.types";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

export interface PlanDayClient {
  from(table: "sessions"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: SessionRow[] | null; error: Error | null }>;
    };
  };
  deleteFrom(rows: SessionRow[]): Promise<{ error: Error | null }>;
  insert(table: "sessions", row: SessionInsert): Promise<{ error: Error | null }>;
}

type PlanDayInput = {
  localDate: string;
  plan: unknown;
};

function ownsPlannedWorkout(sessionType: string | null): boolean {
  return sessionType === "weights" || sessionType === "bodyweight";
}

export async function planDayCore(
  client: PlanDayClient,
  userId: string,
  input: PlanDayInput,
  today: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { localDate, plan } = input;

  // Date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return { ok: false, error: "That is not a date." };
  }

  // Past date check
  if (localDate < today) {
    return { ok: false, error: "That day has already been and gone." };
  }

  // Fetch existing sessions for this date
  const { data: existing, error: fetchError } = await client
    .from("sessions")
    .select("*")
    .eq("local_date", localDate);

  if (fetchError) {
    return { ok: false, error: "Failed to fetch planned sessions." };
  }

  const existingSessions = existing ?? [];

  // Check for settled (completed or in-progress) workout sessions
  const settled = existingSessions.find(
    (s) =>
      ownsPlannedWorkout(s.actual_type) &&
      (s.status === "completed" || s.status === "in_progress")
  );

  if (settled) {
    return {
      ok: false,
      error:
        settled.status === "completed"
          ? "That day is already done."
          : "That session has already started.",
    };
  }

  // Validation
  if (!plan) {
    return { ok: false, error: "No plan was provided." };
  }

  if (typeof plan !== "object" || plan === null) {
    return { ok: false, error: "Invalid plan: must be an object." };
  }

  if (!("kind" in plan)) {
    return { ok: false, error: "Invalid plan: must have a kind." };
  }

  if (typeof plan.kind !== "string" || !plan.kind) {
    return { ok: false, error: "Invalid plan: must have a kind." };
  }

  const validKinds = ["keep", "training", "yoga", "breathing", "rest"];
  if (!validKinds.includes(plan.kind)) {
    return { ok: false, error: "Invalid plan type." };
  }

  // Fetch existing planned sessions for this date
  const plannedSessions = existingSessions.filter((s) => s.status === "planned");

  // Handle "keep" - no-op
  if (plan.kind === "keep") {
    return { ok: true };
  }

  // Delete existing planned sessions
  if (plannedSessions.length > 0) {
    const { error: deleteError } = await client.deleteFrom(plannedSessions);
    if (deleteError) {
      return { ok: false, error: "Failed to delete old sessions." };
    }
  }

  // Handle rest
  if (plan.kind === "rest") {
    const restSession: SessionInsert = {
      user_id: userId,
      local_date: localDate,
      status: "planned",
      actual_type: "rest",
    };

    const { error: insertError } = await client.insert("sessions", restSession);
    if (insertError) {
      return { ok: false, error: "Failed to insert rest session." };
    }

    return { ok: true };
  }

  // Handle training/yoga/breathing
  const dayTypeMap: Record<string, Database["public"]["Enums"]["day_type"]> = {
    training: "weights",
    yoga: "yoga",
    breathing: "meditation",
  };

  const actualType = dayTypeMap[plan.kind];
  if (!actualType) {
    return { ok: false, error: "Invalid plan type." };
  }

  const newSession: SessionInsert = {
    user_id: userId,
    local_date: localDate,
    status: "planned",
    actual_type: actualType,
  };

  const { error: insertError } = await client.insert("sessions", newSession);
  if (insertError) {
    return { ok: false, error: "Failed to insert session." };
  }

  return { ok: true };
}
