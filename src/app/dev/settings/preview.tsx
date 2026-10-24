"use client";

import {
  SettingsForm,
  type EquipmentRow,
  type SettingsActions,
  type SettingsState,
} from "@/app/settings/settings-form";

const ok = async () => ({ ok: true }) as const;

const STUB: SettingsActions = {
  updateSessionSettings: ok,
  updateProfileSettings: ok,
  updateEquipment: ok,
  updateInjuries: ok,
};

const EQUIPMENT: EquipmentRow[] = [
  { id: "bodyweight", name: "Bodyweight (no equipment)", category: "bodyweight" },
  { id: "pull_up_bar", name: "Pull-up bar", category: "bodyweight" },
  { id: "barbell", name: "Barbell", category: "free_weight" },
  { id: "dumbbell", name: "Dumbbells", category: "free_weight" },
  { id: "squat_rack", name: "Squat rack", category: "machine" },
  { id: "cable_machine", name: "Cable machine", category: "cable" },
  { id: "resistance_band", name: "Resistance bands", category: "accessory" },
];

const INITIAL: SettingsState = {
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 60,
  hasAllEquipment: false,
  equipmentIds: ["barbell", "dumbbell"],
  injuries: [{ bodyRegion: "knee", severity: "current" }],
  planningMode: "progression",
  perSetLogging: true,
  resumeSession: true,
  cooldownEnabled: true,
  restAutostart: true,
  restSound: true,
  restVibrate: true,
  restOverrideSeconds: null,
  bodyweightPrompt: "weekly",
  timezone: null,
  units: "metric",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function SettingsPreview() {
  return <SettingsForm initial={INITIAL} equipment={EQUIPMENT} timezones={TIMEZONES} actions={STUB} />;
}
