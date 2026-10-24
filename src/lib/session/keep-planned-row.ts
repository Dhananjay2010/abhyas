/**
 * Pure function to build a Keep planned row.
 * Used by planDay when the user chooses "Keep it" to preserve the template day.
 */

import { isoWeekday } from "@/lib/dates";
import { weekInBlock } from "@/lib/program/prescription";
import type { Database } from "@/lib/database.types";

export interface KeepPlannedRowInput {
  userId: string;
  program: {
    id: string;
    started_on: string;
    deload_week: number | null;
  };
  programDay: {
    id: string;
    day_type: Database["public"]["Enums"]["day_type"];
  };
  localDate: string;
}

export interface KeepPlannedRow {
  user_id: string;
  program_id: string;
  program_day_id: string;
  local_date: string;
  week_in_block: number | null;
  is_deload: boolean;
  status: "planned";
  actual_type: Database["public"]["Enums"]["day_type"];
  planned_type: Database["public"]["Enums"]["day_type"];
}

export function keepPlannedRow(input: KeepPlannedRowInput): KeepPlannedRow {
  const { userId, program, programDay, localDate } = input;

  const week = weekInBlock(program.started_on, localDate);

  return {
    user_id: userId,
    program_id: program.id,
    program_day_id: programDay.id,
    local_date: localDate,
    week_in_block: week,
    is_deload: week !== null && week === program.deload_week,
    status: "planned",
    actual_type: programDay.day_type,
    planned_type: programDay.day_type,
  };
}
