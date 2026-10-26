"use client";

import { useState } from "react";
import {
  OnboardingFlow,
  type EquipmentRow,
  type InitialState,
  type OnboardingActions,
} from "@/app/onboarding/onboarding-flow";

const BLANK: InitialState = {
  displayName: "Dhananjay Rawat",
  dateOfBirth: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  goal: null,
  level: null,
  primaryTrack: null,
  daysPerWeek: null,
  sessionMinutes: null,
  yogaDaysPerWeek: 0,
  disclaimerAccepted: false,
  hasAllEquipment: false,
  equipmentIds: [],
  injuries: [],
  units: "metric",
};

const ok = async () => ({ ok: true }) as const;

const STUB_ACTIONS: OnboardingActions = {
  acceptDisclaimer: ok,
  saveAboutYou: ok,
  saveProfileFields: ok,
  saveEquipment: ok,
  saveInjuries: ok,
  saveSessionLength: ok,
  completeOnboarding: ok,
};

export function OnboardingPreview({ equipment }: { equipment: EquipmentRow[] }) {
  const [done, setDone] = useState(false);
  const [runId, setRunId] = useState(0);

  if (done) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">Flow reached the end.</p>
          <p className="mt-2 text-sm text-muted">
            Persistence was stubbed — nothing was written.
          </p>
          <button
            onClick={() => {
              setDone(false);
              setRunId((n) => n + 1);
            }}
            className="mt-6 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-fg"
          >
            Run again
          </button>
        </div>
      </main>
    );
  }

  return (
    <OnboardingFlow
      key={runId}
      initial={BLANK}
      equipment={equipment}
      actions={STUB_ACTIONS}
      onFinish={() => setDone(true)}
    />
  );
}
