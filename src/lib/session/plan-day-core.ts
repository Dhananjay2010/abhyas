import type { Database } from "@/lib/database.types";
import { validatePlanDayInput } from "@/lib/session/validate-plan-day-input";
import { cycleWeekFor } from "@/lib/program/block-range";
import { idsToDeleteOnKeep } from "@/lib/session/ids-to-delete-on-keep";
import { isoWeekday } from "@/lib/dates";

type DayType = Database["public"]["Enums"]["day_type"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionRow = {
  id: string;
  status: string;
  actual_type: DayType | null;
  program_day_id?: string | null;
};

const OVERRIDE_TYPE: Record<string, DayType> = {
  rest: "rest",
  yoga: "yoga",
  breathing: "meditation",
};

export type DayPlan =
  | { kind: "keep" }
  | { kind: "training"; programDayId: string }
  | { kind: "yoga" }
  | { kind: "breathing" }
  | { kind: "rest" };

type Program = {
  id: string;
  started_on: string;
  deload_week: number;
  week_offset: number;
};

type ProgramDay = {
  id: string;
  day_type: DayType;
};

export interface PlanDayClient {
  findDaySessions(localDate: string): Promise<{ rows: SessionRow[]; error: string | null }>;
  findActiveProgram(): Promise<{ program: Program | null; error: string | null }>;
  loadProgramDay(programDayId: string): Promise<{ ok: true; day: ProgramDay } | { ok: false; error: string }>;
  findProgramDay(programId: string, dayIndex: number): Promise<{ day: ProgramDay | null; error: string | null }>;
  updateSession(id: string, row: SessionInsert): Promise<{ error: string | null }>;
  deleteSessions(ids: string[]): Promise<{ error: string | null }>;
  insertSession(row: SessionInsert): Promise<{ error: string | null }>;
  rereadDaySessions(localDate: string): Promise<{ rows: SessionRow[]; error: string | null }>;
}

type PlanDayInput = {
  userId: string;
  localDate: string;
  today: string;
  plan: DayPlan;
};

type Result = { ok: true } | { ok: false; error: string };

function ownsPlannedWorkout(actualType: DayType | null): boolean {
  return actualType === "weights" || actualType === "bodyweight";
}

export async function planDayCore(
  client: PlanDayClient,
  input: PlanDayInput,
): Promise<Result> {
  const validationError = validatePlanDayInput(input.plan);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) {
    return { ok: false, error: "That is not a date." };
  }
  if (input.localDate < input.today) {
    return { ok: false, error: "That day has already been and gone." };
  }

  const sessionsResult = await client.findDaySessions(input.localDate);
  if (sessionsResult.error) {
    return { ok: false, error: sessionsResult.error };
  }

  const existing = sessionsResult.rows;

  const settled = existing.find(
    (s) =>
      ownsPlannedWorkout(s.actual_type) &&
      (s.status === "completed" || s.status === "in_progress"),
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

  const planned = existing.filter((s) => s.status === "planned");

  if (input.plan.kind === "keep") {
    const ids = idsToDeleteOnKeep(planned);
    if (ids.length === 0 && planned.length > 0) {
      return { ok: true };
    }

    const programResult = await client.findActiveProgram();
    if (programResult.error) {
      return { ok: false, error: programResult.error };
    }
    const program = programResult.program;
    if (!program) {
      return { ok: false, error: "No active program." };
    }

    const dayIndex = isoWeekday(input.localDate);
    const programDayResult = await client.findProgramDay(program.id, dayIndex);
    if (programDayResult.error) {
      return { ok: false, error: programDayResult.error };
    }
    if (!programDayResult.day) {
      return { ok: false, error: "Could not find program day." };
    }

    const day = programDayResult.day;
    const matchingRows = planned.filter((s) => s.actual_type === day.day_type && s.program_day_id === day.id);

    if (matchingRows.length > 0) {
      matchingRows.sort((a, b) => a.id.localeCompare(b.id));
      const toKeep = matchingRows[0];
      const toDelete = planned.filter((s) => s.id !== toKeep.id).map((s) => s.id);
      if (toDelete.length > 0) {
        const deleteResult = await client.deleteSessions(toDelete);
        if (deleteResult.error) {
          return { ok: false, error: deleteResult.error };
        }
      }
      return { ok: true };
    }

    if (ids.length > 0) {
      const deleteResult = await client.deleteSessions(ids);
      if (deleteResult.error) {
        return { ok: false, error: deleteResult.error };
      }
    }

    const week = cycleWeekFor(
      { started_on: program.started_on, week_offset: program.week_offset },
      input.localDate,
    );

    const row: SessionInsert = {
      user_id: input.userId,
      program_id: program.id,
      program_day_id: day.id,
      local_date: input.localDate,
      week_in_block: week,
      is_deload: week === program.deload_week,
      planned_type: day.day_type,
      actual_type: day.day_type,
      status: "planned",
    };

    const insertResult = await client.insertSession(row);
    if (insertResult.error) {
      return { ok: false, error: insertResult.error };
    }

    const rereadResult = await client.rereadDaySessions(input.localDate);
    if (rereadResult.error) {
      return { ok: false, error: rereadResult.error };
    }

    const newPlanned = rereadResult.rows.filter((s) => s.status === "planned");
    const matchingDuplicates = newPlanned.filter((s) => s.actual_type === day.day_type && s.program_day_id === day.id);

    if (matchingDuplicates.length > 1) {
      matchingDuplicates.sort((a, b) => a.id.localeCompare(b.id));
      const toDelete = matchingDuplicates.slice(1).map((s) => s.id);
      const dedupeResult = await client.deleteSessions(toDelete);
      if (dedupeResult.error) {
        return { ok: false, error: dedupeResult.error };
      }
    }

    return { ok: true };
  }

  const programResult = await client.findActiveProgram();
  if (programResult.error) {
    return { ok: false, error: programResult.error };
  }
  const program = programResult.program;

  let actualType: DayType;
  let programDayId: string | null = null;

  if (input.plan.kind === "training") {
    const dayResult = await client.loadProgramDay(input.plan.programDayId);
    if (!dayResult.ok) {
      return { ok: false, error: dayResult.error };
    }
    actualType = dayResult.day.day_type;
    programDayId = dayResult.day.id;
  } else {
    actualType = OVERRIDE_TYPE[input.plan.kind];
  }

  const week = program
    ? cycleWeekFor(
        { started_on: program.started_on, week_offset: program.week_offset },
        input.localDate,
      )
    : null;

  const row: SessionInsert = {
    user_id: input.userId,
    program_id: program?.id ?? null,
    program_day_id: programDayId,
    local_date: input.localDate,
    week_in_block: week,
    is_deload: week !== null && week === program?.deload_week,
    planned_type: actualType,
    actual_type: actualType,
    status: "planned",
  };

  if (planned.length > 0) {
    const [first, ...rest] = planned;
    if (rest.length > 0) {
      const deleteResult = await client.deleteSessions(rest.map((s) => s.id));
      if (deleteResult.error) {
        return { ok: false, error: deleteResult.error };
      }
    }
    const updateResult = await client.updateSession(first.id, row);
    if (updateResult.error) {
      return { ok: false, error: updateResult.error };
    }
  } else {
    const insertResult = await client.insertSession(row);
    if (insertResult.error) {
      return { ok: false, error: insertResult.error };
    }
  }

  return { ok: true };
}
