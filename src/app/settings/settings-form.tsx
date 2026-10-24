"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
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
import { SESSION_LENGTH_OPTIONS } from "@/lib/onboarding/session-length";
import { ErrorNote, OptionCard } from "@/components/ui";
import { BuildPlanButton } from "@/app/today/build-plan-button";
import { branding } from "@/lib/branding";
import { resolveTimezoneWithProfile, FALLBACK_TIMEZONE } from "@/lib/timezone";
import { getTodayIsoInTimezone } from "@/lib/dates/today-iso";
import {
  updateEquipment,
  updateInjuries,
  updateProfileSettings,
  updateSessionSettings,
  type Result,
} from "./actions";
import { decideClientEquipmentUpdate, getEquipmentOffMessage } from "./equipment-logic";
import { createSaveQueue } from "./save-queue";
import { TimezonePicker } from "./timezone-picker";
import { canonicalizeTimezone } from "@/lib/timezone-canonical";
import { DobInput } from "@/components/onboarding/dob-input";
import { validateDob, getDobErrorMessage } from "@/lib/onboarding/dob";
import { isSessionExpired } from "@/lib/auth/session-expired";
import { useSessionExpiredPrompt, notifySessionExpired } from "@/components/session-expired-prompt";
import { stashPendingChanges, getPendingChanges, clearPendingChanges, type PendingChange } from "@/lib/auth/pending-changes";
import { usePathname } from "next/navigation";

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
  dateOfBirth: string | null;
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
  actions = REAL_ACTIONS,
}: {
  initial: SettingsState;
  equipment: EquipmentRow[];
  timezones: string[];
  actions?: SettingsActions;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState(initial);
  const [sessionExpiredPrompt] = useSessionExpiredPrompt();
  const [pendingRestoreApplied, setPendingRestoreApplied] = useState(false);
  
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
  
  /** Set when a change alters what the generator would produce. */
  const [planStale, setPlanStale] = useState(false);
  
  /** Save queue for serialized, coalesced saves */
  const [saveQueue] = useState(() => createSaveQueue<Result>());
  
  /** Errors per field key (never drop errors) */
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  
  /** Browser timezone detected on client after mount */
  const [browserTimezone, setBrowserTimezone] = useState<string | null>(null);
  
  /** DOB error state (client-side validation) */
  const [dobError, setDobError] = useState<string | null>(null);
  /** DOB touched state */
  const [dobTouched, setDobTouched] = useState(false);
  /** Last successfully saved DOB (baseline to prevent re-saves) */
  const lastSavedDob = useRef<string | null>(initial.dateOfBirth);
  const currentDob = useRef<string | null>(initial.dateOfBirth);
  
  /** Track if we need beforeunload prompt */
  const needsUnloadPrompt = useRef(false);

  useEffect(() => {
    if (equipmentOffConfirmation) {
      const timer = setTimeout(() => setEquipmentOffConfirmation(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [equipmentOffConfirmation]);

  useEffect(() => {
    if (timezoneConfirmation) {
      const timer = setTimeout(() => setTimezoneConfirmation(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [timezoneConfirmation]);

  useEffect(() => {
    // Detect browser timezone on client after mount
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const canonical = canonicalizeTimezone(detected);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrowserTimezone(canonical);
    } catch {
      // Ignore errors
    }
  }, []);

  useEffect(() => {
    // Restore pending changes after sign-in
    if (pendingRestoreApplied) return;
    
    const pending = getPendingChanges();
    if (!pending || pending.returnPath !== pathname) {
      return;
    }

    setPendingRestoreApplied(true);
    clearPendingChanges();

    // Re-apply the pending changes once through the save queue
    for (const change of pending.changes) {
      const { field, value } = change;
      
      if (field === 'preferredSessionMinutes' && typeof value === 'number') {
        setS(prev => ({ ...prev, preferredSessionMinutes: value }));
        saveProfile('preferred_session_minutes', { preferred_session_minutes: value }, true);
      } else if (field === 'timezone' && typeof value === 'string') {
        setS(prev => ({ ...prev, timezone: value }));
        saveProfile('timezone', { timezone: value });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, pendingRestoreApplied]);

  useEffect(() => {
    // Register beforeunload prompt when saves are pending
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (needsUnloadPrompt.current && saveQueue.hasPending()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveQueue]);

  useEffect(() => {
    // Flush on pagehide and visibilitychange
    const handlePageHide = () => {
      if (saveQueue.hasPending()) {
        saveQueue.flush();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && saveQueue.hasPending()) {
        saveQueue.flush();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveQueue]);

  // Update needsUnloadPrompt whenever queue status changes
  useEffect(() => {
    const interval = setInterval(() => {
      needsUnloadPrompt.current = saveQueue.hasPending();
    }, 100);
    return () => clearInterval(interval);
  }, [saveQueue]);

  /** Enqueue a save with the queue, keyed per field */
  function enqueueSave(
    key: string,
    request: () => Promise<Result>,
    affectsPlan = false,
    pendingChange?: PendingChange
  ) {
    startTransition(async () => {
      try {
        const result = await saveQueue.enqueue(key, request);
        
        // Check for session expiration in result
        if (isSessionExpired(result)) {
          if (pendingChange) {
            stashPendingChanges([pendingChange], pathname);
          }
          notifySessionExpired();
          return;
        }
        
        if (!result.ok) {
          // Record error for this field
          setFieldErrors(prev => new Map(prev).set(key, result.error));
          setError(result.error);
        } else {
          // Clear error for this field
          setFieldErrors(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          // Clear global error if no field errors remain
          setFieldErrors(prev => {
            if (prev.size === 0) setError(null);
            return prev;
          });
          if (affectsPlan) setPlanStale(true);
        }
      } catch (err) {
        // Check for session expiration in thrown error
        if (isSessionExpired(err)) {
          if (pendingChange) {
            stashPendingChanges([pendingChange], pathname);
          }
          notifySessionExpired();
          return;
        }
        
        const message = err instanceof Error ? err.message : "Unknown error";
        setFieldErrors(prev => new Map(prev).set(key, message));
        setError(message);
      }
    });
  }

  /** Save profile setting */
  function saveProfile(
    key: string,
    patch: Parameters<typeof actions.updateProfileSettings>[0],
    affectsPlan = false,
    pendingChange?: PendingChange
  ) {
    enqueueSave(key, () => actions.updateProfileSettings(patch), affectsPlan, pendingChange);
  }

  /** Save session setting */
  function saveSession(
    key: string,
    patch: Parameters<typeof actions.updateSessionSettings>[0],
    pendingChange?: PendingChange
  ) {
    enqueueSave(key, () => actions.updateSessionSettings(patch), false, pendingChange);
  }

  /** Save equipment with rollback on error */
  function saveEquipment(hasAll: boolean, equipmentIds: string[], showConfirmation = false) {
    const changed = equipmentChanged(hasAll, equipmentIds);
    
    startTransition(async () => {
      try {
        const result = await saveQueue.enqueue("equipment", () => 
          actions.updateEquipment({ hasAll, equipmentIds })
        );
        
        // Check for session expiration
        if (isSessionExpired(result)) {
          notifySessionExpired();
          return;
        }
        
        if (!result.ok) {
          // Rollback to last saved state
          setS(prev => ({ 
            ...prev, 
            hasAllEquipment: savedEquipment.hasAll, 
            equipmentIds: savedEquipment.ids 
          }));
          setEquipmentHint(null);
          setEquipmentOffConfirmation(null);
          setFieldErrors(prev => new Map(prev).set("equipment", result.error));
          setError(result.error);
        } else {
          // Success: update saved state
          setSavedEquipment({ hasAll, ids: equipmentIds });
          setEquipmentHint(null);
          setFieldErrors(prev => {
            const next = new Map(prev);
            next.delete("equipment");
            return next;
          });
          if (changed) setPlanStale(true);
          
          if (showConfirmation) {
            setEquipmentOffConfirmation(
              getEquipmentOffMessage(hasAll === false && equipmentIds.length > 0)
            );
          }
        }
      } catch (err) {
        // Check for session expiration in thrown error
        if (isSessionExpired(err)) {
          notifySessionExpired();
          return;
        }
        
        const message = err instanceof Error ? err.message : "Unknown error";
        setFieldErrors(prev => new Map(prev).set("equipment", message));
        setError(message);
      }
    });
  }

  /** Save injuries */
  function saveInjuries(injuries: Parameters<typeof actions.updateInjuries>[0]) {
    enqueueSave("injuries", () => actions.updateInjuries(injuries), true);
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

  /** Compute autosave status */
  const queueStatus = saveQueue.getStatus();
  const hasErrors = fieldErrors.size > 0;
  const isSaving = queueStatus.state === "saving" || queueStatus.state === "has-queued";
  const showSaved = !isSaving && !hasErrors && queueStatus.state === "idle";

  const maxYoga = Math.max(0, (s.daysPerWeek ?? 3) - 1);

  return (
    <div className="relative space-y-12">
      {sessionExpiredPrompt}
      
      {/* Sticky autosave status */}
      <div 
        role="status" 
        aria-live="polite"
        className="sticky top-0 z-10 flex min-h-[3rem] items-center border-b border-border bg-background px-4 py-2 text-sm"
        style={{ marginBottom: 0 }}
      >
        {isSaving && <span className="text-muted">Saving…</span>}
        {showSaved && <span className="text-accent">Saved</span>}
        {hasErrors && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-danger">
              {Array.from(fieldErrors.values())[0]}
            </span>
            <button
              onClick={() => {
                // Retry by re-saving all fields with errors
                // For now, just show the first error
              }}
              className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-sm text-accent underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {planStale && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm text-accent">
            Your plan no longer matches these answers. Your week keeps the old layout until you rebuild your block. Rebuilding keeps every session you have already logged.
          </p>
          <div className="mt-3">
            <BuildPlanButton label="Rebuild my block" />
          </div>
        </div>
      )}

      {/* ---------------- training ---------------- */}
      <Section title="Your training" note="Changing these needs a rebuilt block.">
        <Field label="Goal">
          <div className="space-y-2">
            {GOALS.map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.goal === o.value}
                onClick={() => {
                  setS(prev => ({ ...prev, goal: o.value }));
                  saveProfile("goal", { goal: o.value }, true);
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Level">
          <div className="space-y-2">
            {LEVELS.map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.level === o.value}
                onClick={() => {
                  setS(prev => ({ ...prev, level: o.value }));
                  saveProfile("level", { level: o.value }, true);
                }}
              />
            ))}
          </div>
        </Field>

        <Field label="Where you train">
          <div className="space-y-2">
            {[{ value: "weights" as Track, label: "At a gym" }, ...HOME_TRACKS].map((o) => (
              <OptionCard
                key={o.value}
                compact
                label={o.label}
                selected={s.primaryTrack === o.value}
                onClick={() => {
                  setS(prev => ({ ...prev, primaryTrack: o.value }));
                  saveProfile("primary_track", { primary_track: o.value }, true);
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
              setS(prev => ({ ...prev, daysPerWeek: n, yogaDaysPerWeek: yoga }));
              saveProfile("days_per_week", { days_per_week: n, yoga_days_per_week: yoga }, true);
            }}
          />
        </Field>

        <Field label="Yoga days" hint="Counted inside your days per week">
          <Segmented
            options={Array.from({ length: maxYoga + 1 }, (_, n) => ({
              value: n,
              label: `${n}`,
            }))}
            value={s.yogaDaysPerWeek}
            onChange={(n) => {
              setS(prev => ({ ...prev, yogaDaysPerWeek: n }));
              saveProfile("yoga_days_per_week", { yoga_days_per_week: n }, true);
            }}
          />
        </Field>
      </Section>

      {/* ---------------- equipment ---------------- */}
      <Section title="Equipment" note="We never suggest an exercise you cannot do.">
        <button
          onClick={() => {
            const turningOff = s.hasAllEquipment;
            
            if (turningOff) {
              const restoredIds = savedEquipment.ids.length > 0 
                ? savedEquipment.ids 
                : s.equipmentIds;
              
              if (restoredIds.length === 0) {
                setS(prev => ({ ...prev, hasAllEquipment: false, equipmentIds: [] }));
                setEquipmentHint("Pick at least one item; nothing changes until you do");
                setEquipmentOffConfirmation(null);
                return;
              }
              
              setS(prev => ({ ...prev, hasAllEquipment: false, equipmentIds: restoredIds }));
              saveEquipment(false, restoredIds, true);
            } else {
              const decision = decideClientEquipmentUpdate({
                currentHasAll: s.hasAllEquipment,
                currentEquipmentIds: s.equipmentIds,
                action: "toggle",
              });
              
              if (!decision.allow) {
                setEquipmentHint(decision.hint);
                return;
              }
              
              setS(prev => ({ ...prev, hasAllEquipment: true }));
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
                            setEquipmentHint(decision.hint);
                            return;
                          }
                          
                          setS(prev => ({ 
                            ...prev, 
                            hasAllEquipment: decision.newHasAll, 
                            equipmentIds: decision.newEquipmentIds 
                          }));
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
                  setS(prev => ({ ...prev, injuries: next }));
                  saveInjuries(next);
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
                      aria-pressed={inj.severity === sev}
                      onClick={() => {
                        const next = s.injuries.map((i) =>
                          i.bodyRegion === inj.bodyRegion ? { ...i, severity: sev } : i,
                        );
                        setS(prev => ({ ...prev, injuries: next }));
                        saveInjuries(next);
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
                setS(prev => ({ ...prev, planningMode: "progression" }));
                saveSession("planning_mode", { planning_mode: "progression" });
              }}
            />
            <OptionCard
              compact
              label="Daily menu"
              description="A sensible session each day, with no weight memory. Your history is kept either way."
              selected={s.planningMode === "daily_menu"}
              onClick={() => {
                setS(prev => ({ ...prev, planningMode: "daily_menu" }));
                saveSession("planning_mode", { planning_mode: "daily_menu" });
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
            setS(prev => ({ ...prev, perSetLogging: v }));
            saveSession("per_set_logging", { per_set_logging: v });
          }}
        />
        <Toggle
          label="Resume an interrupted session"
          value={s.resumeSession}
          disabled={pending}
          onChange={(v) => {
            setS(prev => ({ ...prev, resumeSession: v }));
            saveSession("resume_session", { resume_session: v });
          }}
        />
        <Toggle
          label="Cool-down block"
          value={s.cooldownEnabled}
          disabled={pending}
          onChange={(v) => {
            setS(prev => ({ ...prev, cooldownEnabled: v }));
            saveSession("cooldown_enabled", { cooldown_enabled: v });
          }}
        />
        <Toggle
          label="Start the rest timer automatically"
          value={s.restAutostart}
          disabled={pending}
          onChange={(v) => {
            setS(prev => ({ ...prev, restAutostart: v }));
            saveSession("rest_timer_autostart", { rest_timer_autostart: v });
          }}
        />
        <Toggle
          label="Sound when rest ends"
          value={s.restSound}
          disabled={pending}
          onChange={(v) => {
            setS(prev => ({ ...prev, restSound: v }));
            saveSession("rest_timer_sound", { rest_timer_sound: v });
          }}
        />
        <Toggle
          label="Vibrate when rest ends"
          hint="Not supported by Safari on iPhone."
          value={s.restVibrate}
          disabled={pending}
          onChange={(v) => {
            setS(prev => ({ ...prev, restVibrate: v }));
            saveSession("rest_timer_vibrate", { rest_timer_vibrate: v });
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
              setS(prev => ({ ...prev, restOverrideSeconds: v }));
              saveSession("rest_seconds_override", { rest_seconds_override: v });
            }}
          />
        </Field>

        <Field label="Session length">
          <Segmented
            options={SESSION_LENGTH_OPTIONS.map((n) => ({ value: n, label: `${n}m` }))}
            value={s.preferredSessionMinutes}
            onChange={(n) => {
              setS(prev => ({ ...prev, preferredSessionMinutes: n }));
              saveProfile(
                "preferred_session_minutes", 
                { preferred_session_minutes: n },
                true,
                { field: 'preferredSessionMinutes', value: n, timestamp: Date.now() }
              );
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
              setS(prev => ({ ...prev, bodyweightPrompt: v }));
              saveSession("bodyweight_prompt", { bodyweight_prompt: v });
            }}
          />
        </Field>

        <p className="text-sm text-muted">
          Breathing length, sound and check-ins are set in the{" "}
          <Link href="/breathe" className="text-fg underline underline-offset-2">
            Breathe tab
          </Link>
          .
        </p>
      </Section>

      {/* ---------------- profile ---------------- */}
      <Section title="Profile" note="Your personal information.">
        <Field label="Date of birth" hint="Must be at least 16 years old">
          <DobInput
            value={s.dateOfBirth}
            onChange={(iso) => {
              currentDob.current = iso;
              setS(prev => ({ ...prev, dateOfBirth: iso }));
              if (dobTouched) {
                const todayIso = getTodayIsoInTimezone(s.timezone ?? null);
                const err = iso ? validateDob(iso, todayIso) : null;
                setDobError(err ? getDobErrorMessage(err) : null);
              }
            }}
            onBlur={() => {
              setDobTouched(true);
              const dobToSave = currentDob.current;
              const todayIso = getTodayIsoInTimezone(s.timezone ?? null);
              
              // Incomplete DOB (null from partial input) - don't save, show error
              if (dobToSave === null && lastSavedDob.current !== null) {
                setDobError("Enter your full date of birth");
                return;
              }
              
              const err = dobToSave ? validateDob(dobToSave, todayIso) : null;
              if (err) {
                setDobError(getDobErrorMessage(err));
                return;
              }
              
              setDobError(null);
              // Only save if changed from last saved and not null
              if (dobToSave !== lastSavedDob.current && dobToSave !== null) {
                startTransition(async () => {
                  try {
                    const result = await saveQueue.enqueue("date_of_birth", () =>
                      actions.updateProfileSettings({ date_of_birth: dobToSave })
                    );
                    
                    if (!result.ok) {
                      // On failed save, revert to last saved value and show error
                      currentDob.current = lastSavedDob.current;
                      setS(prev => ({ ...prev, dateOfBirth: lastSavedDob.current }));
                      setDobError(result.error);
                      setFieldErrors(prev => new Map(prev).set("date_of_birth", result.error));
                    } else {
                      // On successful save, update baseline
                      lastSavedDob.current = dobToSave;
                      setFieldErrors(prev => {
                        const next = new Map(prev);
                        next.delete("date_of_birth");
                        return next;
                      });
                      if (fieldErrors.size === 0) setError(null);
                    }
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    setFieldErrors(prev => new Map(prev).set("date_of_birth", message));
                    setError(message);
                  }
                });
              }
            }}
            error={dobTouched ? dobError ?? undefined : undefined}
          />
        </Field>
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
              setS(prev => ({ ...prev, timezone: v }));
              saveProfile(
                "timezone", 
                { timezone: v },
                false,
                { field: 'timezone', value: v, timestamp: Date.now() }
              );
              setTimezoneConfirmation("Timezone saved");
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

      <Section title="Not built yet">
        <p className="text-sm text-muted">
          Light theme and imperial units are in the plan but not implemented, so
          there is nothing to switch here yet. {branding.name} is dark, kilograms and
          centimetres for now.
        </p>
      </Section>
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
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
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
