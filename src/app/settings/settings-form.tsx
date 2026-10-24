"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BODY_REGIONS,
  GOALS,
  HOME_TRACKS,
  LEVELS,
  splitLabelFor,
  type BodyRegion,
  type Goal,
  type InjurySeverity,
  type Level,
  type Track,
} from "@/lib/onboarding/options";
import { ErrorNote, OptionCard } from "@/components/ui";
import { BuildPlanButton } from "@/app/today/build-plan-button";
import { branding } from "@/lib/branding";
import { resolveTimezoneWithProfile, FALLBACK_TIMEZONE } from "@/lib/timezone";
import {
  updateEquipment,
  updateInjuries,
  updateProfileSettings,
  updateSessionSettings,
  type Result,
} from "./actions";
import { decideClientEquipmentUpdate, getEquipmentOffMessage, createRequestSequence } from "./equipment-logic";
import { TimezonePicker } from "./timezone-picker";
import { canonicalizeTimezone } from "@/lib/timezone-canonical";
import { SESSION_LENGTH_OPTIONS } from "@/lib/onboarding/session-length";

/** Injected so the form can be exercised without a signed-in session. */
export type SettingsActions = {
  updateSessionSettings: typeof updateSessionSettings;
  updateProfileSettings: typeof updateProfileSettings;
  updateEquipment: typeof updateEquipment;
  updateInjuries: typeof updateInjuries;
};

const REAL_ACTIONS: SettingsActions = {
  updateSessionSettings,
  updateProfileSettings,
  updateEquipment,
  updateInjuries,
};

export type EquipmentRow = { id: string; name: string; category: string };

export type SettingsState = {
  goal: Goal | null;
  level: Level | null;
  primaryTrack: Track | null;
  daysPerWeek: number | null;
  yogaDaysPerWeek: number;
  preferredSessionMinutes: number;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  injuries: { bodyRegion: BodyRegion; severity: InjurySeverity }[];
  planningMode: "progression" | "daily_menu";
  perSetLogging: boolean;
  resumeSession: boolean;
  cooldownEnabled: boolean;
  restAutostart: boolean;
  restSound: boolean;
  restVibrate: boolean;
  restOverrideSeconds: number | null;
  bodyweightPrompt: "daily" | "weekly" | "never";
  timezone: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  bodyweight: "No equipment",
  free_weight: "Free weights",
  machine: "Machines",
  cable: "Cables",
  accessory: "Accessories",
};

export function SettingsForm({
  initial,
  equipment,
  timezones,
  initialPlanStale = false,
  currentWeek = null,
  actions = REAL_ACTIONS,
}: {
  initial: SettingsState;
  equipment: EquipmentRow[];
  timezones: string[];
  initialPlanStale?: boolean;
  currentWeek?: number | null;
  actions?: SettingsActions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Track whether plan is stale (starts from server, updates on rebuild) */
  const [planStale, setPlanStale] = useState(initialPlanStale);
  const [s, setS] = useState(initial);
  /** Track initial equipment to detect real changes */
  const [initialEquipment] = useState({
    hasAll: initial.hasAllEquipment,
    ids: initial.equipmentIds,
  });
  /** Track saved equipment for rollback on error */
  const [savedEquipment, setSavedEquipment] = useState({
    hasAll: initial.hasAllEquipment,
    ids: initial.equipmentIds,
  });
  /** Equipment hint shown when user tries an unsaveable state */
  const [equipmentHint, setEquipmentHint] = useState<string | null>(null);
  /** Confirmation message shown when turning off "I have access to everything" */
  const [equipmentOffConfirmation, setEquipmentOffConfirmation] = useState<string | null>(null);
  /** QA Issue #7: Confirmation shown when timezone is saved */
  const [timezoneConfirmation, setTimezoneConfirmation] = useState<string | null>(null);
  /** Success message shown after rebuild */
  const [rebuildSuccess, setRebuildSuccess] = useState(false);
  /** Undo toast for level/track changes that affect the plan */
  const [undoToast, setUndoToast] = useState<{ field: 'level' | 'track'; oldValue: Level | Track } | null>(null);
  /** L4 QA fix: Request sequence to ignore stale equipment save responses */
  const [equipmentSequence] = useState(() => createRequestSequence());
  /** F2: Browser timezone detected on client after mount */
  const [browserTimezone, setBrowserTimezone] = useState<string | null>(null);
  /** L3: Per-field saved status */
  const [savedField, setSavedField] = useState<string | null>(null);

  useEffect(() => {
    if (equipmentOffConfirmation) {
      const timer = setTimeout(() => setEquipmentOffConfirmation(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [equipmentOffConfirmation]);

  useEffect(() => {
    // QA Issue #7: Auto-hide timezone confirmation after 4s
    if (timezoneConfirmation) {
      const timer = setTimeout(() => setTimezoneConfirmation(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [timezoneConfirmation]);

  useEffect(() => {
    // Auto-hide rebuild success message after 4s
    if (rebuildSuccess) {
      const timer = setTimeout(() => setRebuildSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [rebuildSuccess]);

  useEffect(() => {
    // Auto-hide undo toast after 5s
    if (undoToast) {
      const timer = setTimeout(() => {
        setUndoToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [undoToast]);

  useEffect(() => {
    // F2: Detect browser timezone on client after mount, canonicalized
    // (older Chrome reports Asia/Calcutta instead of Asia/Kolkata)
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const canonical = canonicalizeTimezone(detected);
      // This is a valid use of setState in effect - runs once after mount
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrowserTimezone(canonical);
    } catch {
      // Ignore errors in browsers that don't support timeZone
    }
  }, []);

  function save(run: () => Promise<Result>, affectsPlan = false, fieldName?: string) {
    startTransition(async () => {
      const r = await run();
      if (!r.ok) return setError(r.error);
      setError(null);
      if (fieldName) setSavedField(fieldName);
      // No router.refresh() here. updateSettings and friends revalidate
      // "/settings", and Next.js returns the re-rendered tree with the action's
      // own response — refreshing on top of that fetched this five-query screen
      // a second time, on every single toggle.
    });
  }

  /** Save equipment with rollback on error */
  function saveEquipment(hasAll: boolean, equipmentIds: string[], showConfirmation = false) {
    const changed = equipmentChanged(hasAll, equipmentIds);
    // L4 QA fix: Track request sequence to ignore stale responses
    const requestSeq = equipmentSequence.next();
    
    startTransition(async () => {
      const r = await actions.updateEquipment({ hasAll, equipmentIds });
      
      // L4 QA fix: Ignore stale responses from overlapping saves
      if (!equipmentSequence.isCurrent(requestSeq)) {
        return;
      }
      
      if (!r.ok) {
        // Rollback to last saved state
        setS({ ...s, hasAllEquipment: savedEquipment.hasAll, equipmentIds: savedEquipment.ids });
        setEquipmentHint(null);
        setEquipmentOffConfirmation(null);
        return setError(r.error);
      }
      // Success: update saved state
      setSavedEquipment({ hasAll, ids: equipmentIds });
      setEquipmentHint(null);
      setError(null);
      // Equipment changes affect plan generation, server will detect staleness on next render
      
      // Show confirmation toast only after save succeeds and response is current
      if (showConfirmation) {
        setEquipmentOffConfirmation(getEquipmentOffMessage(hasAll === false && equipmentIds.length > 0));
      }
    });
  }

  /** Check if equipment actually changed from initial state */
  function equipmentChanged(hasAll: boolean, equipmentIds: string[]): boolean {
    if (hasAll !== initialEquipment.hasAll) return true;
    const sortedInitial = [...initialEquipment.ids].sort();
    const sortedNew = [...equipmentIds].sort();
    return (
      sortedInitial.length !== sortedNew.length ||
      sortedInitial.some((id, i) => id !== sortedNew[i])
    );
  }

  /** Undo a level or track change by saving the old value back */
  function handleUndo() {
    if (!undoToast) return;
    if (undoToast.field === 'level') {
      const oldLevel = undoToast.oldValue as Level;
      setS({ ...s, level: oldLevel });
      save(() => actions.updateProfileSettings({ level: oldLevel }), true);
    } else if (undoToast.field === 'track') {
      const oldTrack = undoToast.oldValue as Track;
      setS({ ...s, primaryTrack: oldTrack });
      save(() => actions.updateProfileSettings({ primary_track: oldTrack }), true);
    }
    setUndoToast(null);
  }

  const maxYoga = Math.max(0, (s.daysPerWeek ?? 3) - 1);

  return (
    <div className="space-y-12 pb-32">
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* ---------------- training ---------------- */}
      <Section title="Your training" note="Changes here apply when you update your plan.">
        <Field label="Goal" saved={savedField === "goal"}>
          <div className="space-y-2">
            {GOALS.map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.goal === o.value}
                onClick={() => {
                  setS({ ...s, goal: o.value });
                  save(() => actions.updateProfileSettings({ goal: o.value }), true, "goal");
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Level" saved={savedField === "level"}>
          <div className="space-y-2">
            {LEVELS.map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.level === o.value}
                onClick={() => {
                  const oldLevel = s.level;
                  setS({ ...s, level: o.value });
                  // Save immediately and show undo toast
                  setUndoToast({ field: 'level', oldValue: oldLevel! });
                  save(() => actions.updateProfileSettings({ level: o.value }), true, "level");
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Where you train" saved={savedField === "track"}>
          <div className="space-y-2">
            {[{ value: "weights" as Track, label: "At a gym" }, ...HOME_TRACKS].map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.primaryTrack === o.value}
                onClick={() => {
                  const oldTrack = s.primaryTrack;
                  setS({ ...s, primaryTrack: o.value });
                  // Save immediately and show undo toast
                  setUndoToast({ field: 'track', oldValue: oldTrack! });
                  save(() => actions.updateProfileSettings({ primary_track: o.value }), true, "track");
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Days per week" hint={splitLabelFor(s.daysPerWeek ?? 3, s.yogaDaysPerWeek)}>
          <Segmented
            options={[3, 4, 5, 6].map((n) => ({ value: n, label: `${n}` }))}
            value={s.daysPerWeek}
            onChange={(n) => {
              const yoga = Math.min(s.yogaDaysPerWeek, n - 1);
              setS({ ...s, daysPerWeek: n, yogaDaysPerWeek: yoga });
              save(
                () => actions.updateProfileSettings({ days_per_week: n, yoga_days_per_week: yoga }),
                true,
              );
            }}
          />
        </Field>

        <Field label="Yoga days" hint="Counted inside your days per week" saved={savedField === "yogaDays"}>
          <Segmented
            options={Array.from({ length: maxYoga + 1 }, (_, n) => ({
              value: n,
              label: `${n}`,
            }))}
            value={s.yogaDaysPerWeek}
            onChange={(n) => {
              setS({ ...s, yogaDaysPerWeek: n });
              save(() => actions.updateProfileSettings({ yoga_days_per_week: n }), true, "yogaDays");
            }}
          />
        </Field>
      </Section>

      {/* ---------------- equipment ---------------- */}
      <Section title="Equipment" note="We never suggest an exercise you cannot do.">
        <button
          onClick={() => {
            // E2: When turning OFF, pre-select the user's saved equipment rows
            const turningOff = s.hasAllEquipment;
            
            if (turningOff) {
              // Pre-select saved equipment when turning OFF
              const restoredIds = savedEquipment.ids.length > 0 
                ? savedEquipment.ids 
                : s.equipmentIds;
              
              if (restoredIds.length === 0) {
                // E2: Turning OFF with no saved equipment - show picker with clear message
                setS({ ...s, hasAllEquipment: false, equipmentIds: [] });
                setEquipmentHint("Pick at least one item; nothing changes until you do");
                setEquipmentOffConfirmation(null);
                return;
              }
              
              // Has saved equipment to restore - turn OFF and save
              setS({ ...s, hasAllEquipment: false, equipmentIds: restoredIds });
              // Show confirmation toast after save succeeds
              saveEquipment(false, restoredIds, true);
            } else {
              // Turning ON - validate first
              const decision = decideClientEquipmentUpdate({
                currentHasAll: s.hasAllEquipment,
                currentEquipmentIds: s.equipmentIds,
                action: "toggle",
              });
              
              if (!decision.allow) {
                setEquipmentHint(decision.hint);
                return;
              }
              
              // Turn ON and save
              setS({ ...s, hasAllEquipment: true });
              saveEquipment(true, s.equipmentIds);
            }
          }}
          aria-pressed={s.hasAllEquipment}
          className={`w-full rounded-xl border px-5 py-3 text-left text-sm font-semibold ${
            s.hasAllEquipment
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface"
          }`}
        >
          I have access to everything
        </button>

        {equipmentOffConfirmation && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-accent/10 px-4 py-2 text-sm text-accent"
          >
            {equipmentOffConfirmation}
          </div>
        )}

        {!s.hasAllEquipment && (
          <div className="mt-5">
            {equipmentHint && (
              <p className="mb-4 text-sm text-muted">{equipmentHint}</p>
            )}
            {Object.entries(
              equipment.reduce<Record<string, EquipmentRow[]>>((acc, e) => {
                (acc[e.category] ??= []).push(e);
                return acc;
              }, {}),
            ).map(([category, items]) => (
              <div key={category} className="mb-5">
                <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {items.map((e) => {
                    const on = s.equipmentIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        aria-pressed={on}
                        onClick={() => {
                          const decision = decideClientEquipmentUpdate({
                            currentHasAll: s.hasAllEquipment,
                            currentEquipmentIds: s.equipmentIds,
                            action: "chip-click",
                            chipId: e.id,
                          });
                          
                          if (!decision.allow) {
                            // Don't save, show hint
                            setEquipmentHint(decision.hint);
                            return;
                          }
                          
                          // Allow the change and save
                          setS({ ...s, hasAllEquipment: decision.newHasAll, equipmentIds: decision.newEquipmentIds });
                          saveEquipment(decision.newHasAll, decision.newEquipmentIds);
                        }}
                        className={`rounded-full border px-4 py-2 text-sm ${
                          on
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-surface text-muted"
                        }`}
                      >
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------- injuries ---------------- */}
      <Section
        title="Injuries"
        note="Current injuries remove exercises. Past ones only add prehab to your warm-up."
      >
        <div className="flex flex-wrap gap-2">
          {BODY_REGIONS.map((r) => {
            const found = s.injuries.find((i) => i.bodyRegion === r.value);
            return (
              <button
                key={r.value}
                aria-pressed={Boolean(found)}
                onClick={() => {
                  const next = found
                    ? s.injuries.filter((i) => i.bodyRegion !== r.value)
                    : [...s.injuries, { bodyRegion: r.value, severity: "current" as const }];
                  setS({ ...s, injuries: next });
                  save(() => actions.updateInjuries(next), true);
                }}
                className={`rounded-full border px-4 py-2 text-sm ${
                  found
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {s.injuries.length > 0 && (
          <div className="mt-4 space-y-2">
            {s.injuries.map((inj) => (
              <div
                key={inj.bodyRegion}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
              >
                <span className="text-sm">
                  {BODY_REGIONS.find((r) => r.value === inj.bodyRegion)?.label}
                </span>
                <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
                  {(["current", "past"] as InjurySeverity[]).map((sev) => (
                    <button
                      key={sev}
                      // Every other toggle in this form has one. Without it a
                      // screen reader cannot tell which of Current / Past is
                      // selected, because the distinction is colour alone.
                      aria-pressed={inj.severity === sev}
                      onClick={() => {
                        const next = s.injuries.map((i) =>
                          i.bodyRegion === inj.bodyRegion ? { ...i, severity: sev } : i,
                        );
                        setS({ ...s, injuries: next });
                        save(() => actions.updateInjuries(next), true);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                        inj.severity === sev ? "bg-accent text-accent-fg" : "text-muted"
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------- during a session ---------------- */}
      <Section title="During a session">
        <Field label="Planning mode">
          <div className="space-y-2">
            <OptionCard
              compact
              label="Progression"
              description="Remembers your weights and puts them up when you earn it."
              selected={s.planningMode === "progression"}
              onClick={() => {
                setS({ ...s, planningMode: "progression" });
                save(() => actions.updateSessionSettings({ planning_mode: "progression" }));
              }}
            />
            <OptionCard
              compact
              label="Daily menu"
              description="A sensible session each day, with no weight memory. Your history is kept either way."
              selected={s.planningMode === "daily_menu"}
              onClick={() => {
                setS({ ...s, planningMode: "daily_menu" });
                save(() => actions.updateSessionSettings({ planning_mode: "daily_menu" }));
              }}
            />
          </div>
        </Field>

        <Toggle
          label="Log every set"
          hint="Off means you just tick each exercise off. Progression needs this on."
          value={s.perSetLogging}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, perSetLogging: v });
            save(() => actions.updateSessionSettings({ per_set_logging: v }));
          }}
        />
        <Toggle
          label="Resume an interrupted session"
          value={s.resumeSession}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, resumeSession: v });
            save(() => actions.updateSessionSettings({ resume_session: v }));
          }}
        />
        <Toggle
          label="Cool-down block"
          value={s.cooldownEnabled}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, cooldownEnabled: v });
            save(() => actions.updateSessionSettings({ cooldown_enabled: v }));
          }}
        />
        <Toggle
          label="Start the rest timer automatically"
          value={s.restAutostart}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, restAutostart: v });
            save(() => actions.updateSessionSettings({ rest_timer_autostart: v }));
          }}
        />
        <Toggle
          label="Sound when rest ends"
          value={s.restSound}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, restSound: v });
            save(() => actions.updateSessionSettings({ rest_timer_sound: v }));
          }}
        />
        <Toggle
          label="Vibrate when rest ends"
          hint="Not supported by Safari on iPhone."
          value={s.restVibrate}
          disabled={pending}
          onChange={(v) => {
            setS({ ...s, restVibrate: v });
            save(() => actions.updateSessionSettings({ rest_timer_vibrate: v }));
          }}
        />

        <Field label="Rest length" hint="Overrides the rest your goal sets">
          <Segmented
            options={[
              { value: 0, label: "Auto" },
              { value: 45, label: "45s" },
              { value: 60, label: "60s" },
              { value: 90, label: "90s" },
              { value: 120, label: "2m" },
              { value: 180, label: "3m" },
            ]}
            value={s.restOverrideSeconds ?? 0}
            onChange={(n) => {
              const v = n === 0 ? null : n;
              setS({ ...s, restOverrideSeconds: v });
              save(() => actions.updateSessionSettings({ rest_seconds_override: v }));
            }}
          />
        </Field>

        <Field label="Session length" saved={savedField === "sessionLength"}>
          <Segmented
            options={SESSION_LENGTH_OPTIONS.map((n) => ({ value: n, label: `${n}m` }))}
            value={s.preferredSessionMinutes}
            onChange={(n) => {
              setS({ ...s, preferredSessionMinutes: n });
              save(() => actions.updateProfileSettings({ preferred_session_minutes: n }), true, "sessionLength");
            }}
          />
        </Field>
      </Section>

      {/* ---------------- other ---------------- */}
      <Section title="Reminders">
        <Field label="Weigh-in reminder">
          <Segmented
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "never", label: "Never" },
            ]}
            value={s.bodyweightPrompt}
            onChange={(v) => {
              setS({ ...s, bodyweightPrompt: v });
              save(() => actions.updateSessionSettings({ bodyweight_prompt: v }));
            }}
          />
        </Field>

        {/* Breathing's own preferences moved to the Breathe tab (BREATHE-SPEC.md, Q9). */}
        <p className="text-sm text-muted">
          Breathing length, sound and check-ins are set in the{" "}
          <Link href="/breathe" className="text-fg underline underline-offset-2">
            Breathe tab
          </Link>
          .
        </p>
      </Section>

      {/* ---------------- timezone ---------------- */}
      <Section 
        title="Timezone" 
        note="Your local time for day boundaries and workout scheduling."
      >
        <Field 
          label="Your timezone" 
          hint={`Currently using: ${resolveTimezoneWithProfile(s.timezone)}`}
        >
          <TimezonePicker
            value={s.timezone}
            timezones={timezones}
            deviceZone={browserTimezone}
            gymDefault={branding.timezone || FALLBACK_TIMEZONE}
            onChange={(v) => {
              setS({ ...s, timezone: v });
              // QA Issue #7: Show confirmation only after save succeeds
              startTransition(async () => {
                const r = await actions.updateProfileSettings({ timezone: v });
                if (!r.ok) {
                  setError(r.error);
                  setTimezoneConfirmation(null);
                } else {
                  setError(null);
                  setTimezoneConfirmation("Timezone saved");
                }
              });
            }}
            disabled={pending}
          />
        </Field>

        {timezoneConfirmation && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-accent/10 px-4 py-2 text-sm text-accent"
          >
            {timezoneConfirmation}
          </div>
        )}
      </Section>

      {process.env.NODE_ENV !== "production" && (
        <Section title="Not built yet">
          <p className="text-sm text-muted">
            Light theme and imperial units are in the plan but not implemented, so
            there is nothing to switch here yet. {branding.name} is dark, kilograms and
            centimetres for now.
          </p>
        </Section>
      )}

      {/* M2: Fixed bottom bar for all status messages - out of flow, no layout shift */}
      {(planStale || rebuildSuccess || undoToast) && (
        <div 
          className="fixed left-0 right-0 mx-auto w-full max-w-md px-6 bg-surface border-t border-border z-40"
          style={{
            bottom: "calc(4rem + env(safe-area-inset-bottom))"
          }}
        >
          <div className="py-4 space-y-3">
            {rebuildSuccess && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
              >
                Plan rebuilt
              </div>
            )}

            {undoToast && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-accent">
                  {undoToast.field === 'level' ? 'Level' : 'Training type'} updated. Your plan will update when you apply the change.
                </span>
                <button
                  onClick={handleUndo}
                  disabled={pending}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Undo
                </button>
              </div>
            )}

            {planStale && !rebuildSuccess && (
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
                <p className="text-sm text-accent">
                  Your plan doesn&apos;t include this change yet.
                </p>
                <div className="mt-3">
                  <BuildPlanButton 
                    label="Update my plan to apply this" 
                    currentWeek={currentWeek}
                    showSuccessState={true}
                    onSuccess={() => {
                      setPlanStale(false);
                      setRebuildSuccess(true);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {note && <p className="mt-1 mb-4 text-sm text-muted">{note}</p>}
      <div className={note ? "space-y-6" : "mt-4 space-y-6"}>{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
  saved,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  saved?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium">
        {label}
        {saved && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 text-xs text-success ml-2"
          >
            <svg 
              className="w-3.5 h-3.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </p>
      {hint && <p className="mt-0.5 mb-2 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 text-left disabled:opacity-60"
    >
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${
            value ? "translate-x-6 bg-accent-fg" : "translate-x-1 bg-muted"
          }`}
        />
      </span>
    </button>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-accent text-accent-fg" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
