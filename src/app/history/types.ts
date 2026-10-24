export type SessionType = "lifts" | "yoga" | "breathing";

export interface SessionListItem {
  id: string;
  localDate: string;
  status: string;
  actualType: string | null;
  durationSeconds: number | null;
  startedAt: string | null;
  completedAt: string | null;
  isDeload: boolean;
  endedEarly: boolean;
  plannedSets: number | null;
  programDayLabel: string | null;
  setCount: number;
  volumeKg: number;
  topSetWeight: number | null;
  hasPR: boolean;
  breathing: {
    breaths: number | null;
    pumps: boolean;
    patternName: string | null;
  } | null;
}
