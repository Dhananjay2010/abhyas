"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, useSyncExternalStore } from "react";
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
  setEquipmentItem,
  setHasAllEquipment,
  setInjury,
  type Result,
} from "./actions";
import { decideClientEquipmentUpdate, getEquipmentOffMessage } from "./equipment-logic";
import { createSaveQueue, type SupersededResult } from "./save-queue";
import { TimezonePicker } from "./timezone-picker";
import { canonicalizeTimezone } from "@/lib/timezone-canonical";
import { DobInput } from "@/components/onboarding/dob-input";
import { validateDob, getDobErrorMessage } from "@/lib/onboarding/dob";

/** Injected so the form can be exercised without a signed-in session. */
export type SettingsActions = {
  updateSessionSettings: typeof updateSessionSettings;
  updateProfileSettings: typeof updateProfileSettings;
  updateEquipment: typeof updateEquipment;
  updateInjuries: typeof updateInjuries;
  setEquipmentItem: typeof setEquipmentItem;
  setHasAllEquipment: typeof setHasAllEquipment;
  setInjury: typeof setInjury;
};

const REAL_ACTIONS: SettingsActions = {
  updateSessionSettings,
  updateProfileSettings,
  updateEquipment,
  updateInjuries,
  setEquipmentItem,
  setHasAllEquipment,
  setInjury,
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
  
  /** Set when a change alters what the generator would produce. */
  const [planStale, setPlanStale] = useState(false);
  
  /** Save queue for serialized, coalesced saves */
  const [saveQueue] = useState(() => createSaveQueue<Result>());
  
  /** Errors per field key (never drop errors) */
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map());
  
  /** Browser timezone detected on client after mount */
  const [browserTimezone, setBrowserTimezone] = useState<string | null>(null);
  
  /** Track if any save has occurred (for LOW-a: don't show Saved on first load) */
  const [anySaveOccurred, setAnySaveOccurred] = useState(false);
  
  /** Track last successfully saved values for revert on error (N1) */
  const lastSavedValues = useRef<{
    goal: Goal | null;
    level: Level | null;
    primaryTrack: Track | null;
    daysPerWeek: number | null;
    yogaDaysPerWeek: number;
    preferredSessionMinutes: number;
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
  }>({
    goal: initial.goal,
    level: initial.level,
    primaryTrack: initial.primaryTrack,
    daysPerWeek: initial.daysPerWeek,
    yogaDaysPerWeek: initial.yogaDaysPerWeek,
    preferredSessionMinutes: initial.preferredSessionMinutes,
    planningMode: initial.planningMode,
    perSetLogging: initial.perSetLogging,
    resumeSession: initial.resumeSession,
    cooldownEnabled: initial.cooldownEnabled,
    restAutostart: initial.restAutostart,
    restSound: initial.restSound,
    restVibrate: initial.restVibrate,
    restOverrideSeconds: initial.restOverrideSeconds,
    bodyweightPrompt: initial.bodyweightPrompt,
    timezone: initial.timezone,
  });
  
  /** Track pending field keys to avoid reverting over newer values */
  const pendingKeys = useRef<Set<string>>(new Set());
  
  /** Track retry metadata for each key (M1 fix #2) */
  const retryMetadata = useRef<Map<string, {
    type: 'profile' | 'session';
    patch: Parameters<typeof actions.updateProfileSettings>[0] | Parameters<typeof actions.updateSessionSettings>[0];
    affectsPlan?: boolean;
  }>>(new Map());
  
  /** DOB error state (client-side validation) */
  const [dobError, setDobError] = useState<string | null>(null);
  /** DOB touched state */
  const [dobTouched, setDobTouched] = useState(false);
  /** Last successfully saved DOB (baseline to prevent re-saves) */
  const lastSavedDob = useRef<string | null>(initial.dateOfBirth);
  const currentDob = useRef<string | null>(initial.dateOfBirth);
  
  /** Track if we need beforeunload prompt */
  const needsUnloadPrompt = useRef(false);
  
  /** Router for refresh on tab focus */
  const router = useRouter();
  const lastRefreshTimestamp = useRef(0);

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
      
      // QA#3: Refresh when tab becomes visible (unless saves are pending), throttled to 10s
      if (document.visibilityState === "visible" && !saveQueue.hasPending()) {
        const now = Date.now();
        if (now - lastRefreshTimestamp.current >= 10000) {
          lastRefreshTimestamp.current = now;
          router.refresh();
        }
      }
    };
    
    const handleFocus = () => {
      // Also refresh on window focus, with same throttle and idle check
      if (!saveQueue.hasPending()) {
        const now = Date.now();
        if (now - lastRefreshTimestamp.current >= 10000) {
          lastRefreshTimestamp.current = now;
          router.refresh();
        }
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      
      // MEDIUM 1: Flush pending saves on unmount (soft navigation)
      // This ensures saves complete even after the component unmounts
      if (saveQueue.hasPending()) {
        saveQueue.flush();
      }
    };
  }, [saveQueue, router]);

  // Subscribe to queue status changes for needsUnloadPrompt (LOW-d: use events instead of polling)
  useEffect(() => {
    needsUnloadPrompt.current = saveQueue.hasPending();
    
    const unsubscribe = saveQueue.subscribe((status) => {
      needsUnloadPrompt.current = status.state !== "idle";
    });
    
    return unsubscribe;
  }, [saveQueue]);

  // Subscribe to queue status changes (fix #4: must re-render from queue)
  const queueStatus = useSyncExternalStore(
    saveQueue.subscribe,
    saveQueue.getStatus,
    saveQueue.getStatus
  );

  // Item 5: Serialize initial props to detect changes from router.refresh()
  const initialSerialized = useRef<string>(JSON.stringify(initial));
  const [pendingPropsSync, setPendingPropsSync] = useState<SettingsState | null>(null);

  // Item 5: Detect props changes and re-sync when queue is idle
  useEffect(() => {
    const newSerialized = JSON.stringify(initial);
    
    // Props haven't changed, nothing to do
    if (newSerialized === initialSerialized.current) {
      return;
    }
    
    // Props changed - need to re-sync
    if (queueStatus.state === "idle") {
      // Queue is idle, re-sync immediately
      initialSerialized.current = newSerialized;
      
      // Re-sync state from new props
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with server state from props
      setS(initial);
      
      // Re-sync lastSavedValues
      lastSavedValues.current = {
        goal: initial.goal,
        level: initial.level,
        primaryTrack: initial.primaryTrack,
        daysPerWeek: initial.daysPerWeek,
        yogaDaysPerWeek: initial.yogaDaysPerWeek,
        preferredSessionMinutes: initial.preferredSessionMinutes,
        planningMode: initial.planningMode,
        perSetLogging: initial.perSetLogging,
        resumeSession: initial.resumeSession,
        cooldownEnabled: initial.cooldownEnabled,
        restAutostart: initial.restAutostart,
        restSound: initial.restSound,
        restVibrate: initial.restVibrate,
        restOverrideSeconds: initial.restOverrideSeconds,
        bodyweightPrompt: initial.bodyweightPrompt,
        timezone: initial.timezone,
      };
      
      // Re-sync equipment saved state
      setSavedEquipment({
        hasAll: initial.hasAllEquipment,
        ids: initial.equipmentIds,
      });
      
      // Re-sync DOB
      lastSavedDob.current = initial.dateOfBirth;
      currentDob.current = initial.dateOfBirth;
      
      // LOW 4 (QA Bots 1 and 2): Clear planStale when props re-sync
      // Props changed means router.refresh brought new data (possibly from rebuild)
      setPlanStale(false);
      
      setPendingPropsSync(null);
    } else {
      // Queue is busy, defer re-sync until it drains
      setPendingPropsSync(initial);
    }
  }, [initial, queueStatus.state]);

  // Item 5: Apply pending props sync after queue drains
  useEffect(() => {
    if (pendingPropsSync && queueStatus.state === "idle") {
      const newSerialized = JSON.stringify(pendingPropsSync);
      initialSerialized.current = newSerialized;
      
      // Re-sync state from pending props
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with server state from props
      setS(pendingPropsSync);
      
      // Re-sync lastSavedValues
      lastSavedValues.current = {
        goal: pendingPropsSync.goal,
        level: pendingPropsSync.level,
        primaryTrack: pendingPropsSync.primaryTrack,
        daysPerWeek: pendingPropsSync.daysPerWeek,
        yogaDaysPerWeek: pendingPropsSync.yogaDaysPerWeek,
        preferredSessionMinutes: pendingPropsSync.preferredSessionMinutes,
        planningMode: pendingPropsSync.planningMode,
        perSetLogging: pendingPropsSync.perSetLogging,
        resumeSession: pendingPropsSync.resumeSession,
        cooldownEnabled: pendingPropsSync.cooldownEnabled,
        restAutostart: pendingPropsSync.restAutostart,
        restSound: pendingPropsSync.restSound,
        restVibrate: pendingPropsSync.restVibrate,
        restOverrideSeconds: pendingPropsSync.restOverrideSeconds,
        bodyweightPrompt: pendingPropsSync.bodyweightPrompt,
        timezone: pendingPropsSync.timezone,
      };
      
      // Re-sync equipment saved state
      setSavedEquipment({
        hasAll: pendingPropsSync.hasAllEquipment,
        ids: pendingPropsSync.equipmentIds,
      });
      
      // Re-sync DOB
      lastSavedDob.current = pendingPropsSync.dateOfBirth;
      currentDob.current = pendingPropsSync.dateOfBirth;
      
      // LOW 4 (QA Bots 1 and 2): Clear planStale when props re-sync
      setPlanStale(false);
      
      setPendingPropsSync(null);
    }
  }, [pendingPropsSync, queueStatus.state]);

  /** Get friendly field name for error messages (N1) */
  function getFieldDisplayName(key: string): string {
    const fieldNames: Record<string, string> = {
      goal: "Goal",
      level: "Level",
      primary_track: "Where you train",
      days_per_week: "Days per week",
      yoga_days_per_week: "Yoga days",
      preferred_session_minutes: "Session length",
      planning_mode: "Planning mode",
      per_set_logging: "Log every set",
      resume_session: "Resume session",
      cooldown_enabled: "Cool-down block",
      rest_timer_autostart: "Rest timer autostart",
      rest_timer_sound: "Rest sound",
      rest_timer_vibrate: "Rest vibrate",
      rest_seconds_override: "Rest length",
      bodyweight_prompt: "Weigh-in reminder",
      timezone: "Timezone",
      date_of_birth: "Date of birth",
      equipment: "Equipment",
      injuries: "Injuries",
    };
    return fieldNames[key] || key;
  }

  /** Map API keys (snake_case) to state keys (camelCase) for N1 revert */
  function mapApiKeyToStateKey(apiKey: string): keyof typeof lastSavedValues.current | null {
    const mapping: Record<string, keyof typeof lastSavedValues.current> = {
      goal: "goal",
      level: "level",
      primary_track: "primaryTrack",
      days_per_week: "daysPerWeek",
      yoga_days_per_week: "yogaDaysPerWeek",
      preferred_session_minutes: "preferredSessionMinutes",
      planning_mode: "planningMode",
      per_set_logging: "perSetLogging",
      resume_session: "resumeSession",
      cooldown_enabled: "cooldownEnabled",
      rest_timer_autostart: "restAutostart",
      rest_timer_sound: "restSound",
      rest_timer_vibrate: "restVibrate",
      rest_seconds_override: "restOverrideSeconds",
      bodyweight_prompt: "bodyweightPrompt",
      timezone: "timezone",
    };
    return mapping[apiKey] || null;
  }

  /** Get friendly error message (N1: never show raw 'Failed to fetch') */
  function getFriendlyError(key: string, rawError: string): string {
    const fieldName = getFieldDisplayName(key);
    
    // Never show raw "Failed to fetch"
    if (rawError.toLowerCase().includes("failed to fetch") || rawError.toLowerCase().includes("network")) {
      return `Couldn't save ${fieldName}`;
    }
    
    // If error already mentions the field, use it as-is
    if (rawError.toLowerCase().includes(fieldName.toLowerCase())) {
      return rawError;
    }
    
    // Otherwise prefix with field name
    return `${fieldName}: ${rawError}`;
  }

  /** Enqueue a save with the queue, keyed per field */
  function enqueueSave(
    key: string,
    request: () => Promise<Result>,
    affectsPlan = false,
    onSuccess?: () => void,
    onFailure?: () => void
  ) {
    // Track that this key has a pending save
    pendingKeys.current.add(key);
    
    startTransition(async () => {
      try {
        const result = await saveQueue.enqueue(key, request);
        
        // Handle superseded results (no-op, not an error, not success)
        if (result && typeof result === "object" && "superseded" in result) {
          return;
        }
        
        // Mark that a save has occurred (for LOW-a)
        setAnySaveOccurred(true);
        
        if (!result.ok) {
          // LOW 2: Only revert if no newer save is pending for THIS key
          // Don't revert if this key has another save in flight or queued
          const keyHasNewerSave = saveQueue.getInFlightKeys().includes(key) || saveQueue.getQueuedKeys().includes(key);
          
          if (!keyHasNewerSave) {
            onFailure?.();
          }
          
          // N1: Use friendly error message
          const friendlyError = getFriendlyError(key, result.error);
          setFieldErrors(prev => new Map(prev).set(key, friendlyError));
          setError(friendlyError);
        } else {
          // Success: update saved value
          onSuccess?.();
          
          // Clear error for this field
          setFieldErrors(prev => {
            const next = new Map(prev);
            next.delete(key);
            // Fix #5: compute in functional update
            if (next.size === 0) setError(null);
            return next;
          });
          if (affectsPlan) setPlanStale(true);
        }
      } catch (err) {
        // LOW 2: Only revert if no newer save is pending for THIS key
        const keyHasNewerSave = saveQueue.getInFlightKeys().includes(key) || saveQueue.getQueuedKeys().includes(key);
        
        if (!keyHasNewerSave) {
          onFailure?.();
        }
        
        const rawMessage = err instanceof Error ? err.message : "Unknown error";
        const friendlyError = getFriendlyError(key, rawMessage);
        setFieldErrors(prev => new Map(prev).set(key, friendlyError));
        setError(friendlyError);
        
        // N1: No uncaught errors - we handled it
      } finally {
        // Remove from pending keys once settled
        pendingKeys.current.delete(key);
      }
    });
  }

  /** Save profile setting */
  function saveProfile(
    key: string,
    patch: Parameters<typeof actions.updateProfileSettings>[0],
    affectsPlan = false
  ) {
    // LOW 3: Capture ALL keys in the patch for multi-key reverts
    const patchEntries = Object.entries(patch);
    
    // Store retry metadata (M1 fix #2)
    retryMetadata.current.set(key, { type: 'profile', patch, affectsPlan });
    
    enqueueSave(
      key,
      () => actions.updateProfileSettings(patch),
      affectsPlan,
      () => {
        // On success: update lastSavedValues AND state for ALL keys in patch
        for (const [apiKey, newValue] of patchEntries) {
          const stateKey = mapApiKeyToStateKey(apiKey);
          if (stateKey && stateKey in lastSavedValues.current) {
            lastSavedValues.current[stateKey] = newValue as never;
            setS(prev => ({ ...prev, [stateKey]: newValue }));
          }
        }
      },
      () => {
        // LOW 3: On failure, revert ALL keys in the patch
        setS(prev => {
          const reverted = { ...prev };
          for (const [apiKey] of patchEntries) {
            const stateKey = mapApiKeyToStateKey(apiKey);
            if (stateKey && stateKey in lastSavedValues.current) {
              reverted[stateKey] = lastSavedValues.current[stateKey] as never;
            }
          }
          return reverted;
        });
      }
    );
  }

  /** Save session setting */
  function saveSession(
    key: string,
    patch: Parameters<typeof actions.updateSessionSettings>[0]
  ) {
    // LOW 3: Capture ALL keys in the patch for multi-key reverts
    const patchEntries = Object.entries(patch);
    
    // Store retry metadata (M1 fix #2)
    retryMetadata.current.set(key, { type: 'session', patch });
    
    enqueueSave(
      key,
      () => actions.updateSessionSettings(patch),
      false,
      () => {
        // On success: update lastSavedValues AND state for ALL keys in patch
        for (const [apiKey, newValue] of patchEntries) {
          const stateKey = mapApiKeyToStateKey(apiKey);
          if (stateKey && stateKey in lastSavedValues.current) {
            lastSavedValues.current[stateKey] = newValue as never;
            setS(prev => ({ ...prev, [stateKey]: newValue }));
          }
        }
      },
      () => {
        // LOW 3: On failure, revert ALL keys in the patch
        setS(prev => {
          const reverted = { ...prev };
          for (const [apiKey] of patchEntries) {
            const stateKey = mapApiKeyToStateKey(apiKey);
            if (stateKey && stateKey in lastSavedValues.current) {
              reverted[stateKey] = lastSavedValues.current[stateKey] as never;
            }
          }
          return reverted;
        });
      }
    );
  }

  /** Save equipment with rollback on error */
  function saveEquipment(hasAll: boolean, equipmentIds: string[], showConfirmation = false) {
    const changed = equipmentChanged(hasAll, equipmentIds);
    
    startTransition(async () => {
      try {
        const result = await saveQueue.enqueue("equipment", () => 
          actions.updateEquipment({ hasAll, equipmentIds })
        );
        
        // Handle superseded results
        if (result && typeof result === "object" && "superseded" in result) {
          return;
        }
        
        // Mark that a save has occurred
        setAnySaveOccurred(true);
        
        if (!result.ok) {
          // Rollback to last saved state
          setS(prev => ({ 
            ...prev, 
            hasAllEquipment: savedEquipment.hasAll, 
            equipmentIds: savedEquipment.ids 
          }));
          setEquipmentHint(null);
          setEquipmentOffConfirmation(null);
          const friendlyError = getFriendlyError("equipment", result.error);
          setFieldErrors(prev => new Map(prev).set("equipment", friendlyError));
          setError(friendlyError);
        } else {
          // Success: update saved state and clear errors (LOW-c)
          setSavedEquipment({ hasAll, ids: equipmentIds });
          setEquipmentHint(null);
          setFieldErrors(prev => {
            const next = new Map(prev);
            next.delete("equipment");
            // Fix #5: compute in functional update
            if (next.size === 0) setError(null);
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
        const rawMessage = err instanceof Error ? err.message : "Unknown error";
        const friendlyError = getFriendlyError("equipment", rawMessage);
        setFieldErrors(prev => new Map(prev).set("equipment", friendlyError));
        setError(friendlyError);
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

  /** Compute autosave status (LOW-b: derive from queue state) */
  const hasErrors = fieldErrors.size > 0;
  const isSaving = queueStatus.state === "saving" || queueStatus.state === "has-queued";
  const showSaved = !isSaving && !hasErrors && queueStatus.state === "idle" && anySaveOccurred;

  const maxYoga = Math.max(0, (s.daysPerWeek ?? 3) - 1);

  return (
    <div className="relative space-y-12">
      {/* Sticky autosave status */}
      <div 
        role="status" 
        aria-live="polite"
        className="sticky top-0 z-10 flex min-h-[3rem] items-center border-b border-border bg-bg px-4 py-2 text-sm"
        style={{ marginBottom: 0 }}
      >
        {isSaving && <span className="text-muted">Saving…</span>}
        {showSaved && <span className="text-accent">Saved</span>}
        {hasErrors && (
          <div className="flex flex-col gap-2 w-full">
            {Array.from(fieldErrors.entries()).map(([key, errorMsg]) => (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <span className="text-danger">{errorMsg}</span>
                <button
                  onClick={() => {
                    // M1 fix #2: Retry through saveProfile/saveSession
                    const metadata = retryMetadata.current.get(key);
                    if (metadata) {
                      if (metadata.type === 'profile') {
                        saveProfile(key, metadata.patch, metadata.affectsPlan);
                      } else if (metadata.type === 'session') {
                        saveSession(key, metadata.patch);
                      }
                    }
                  }}
                  className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-sm text-accent underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ))}
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
            const newState = !s.hasAllEquipment;
            
            // PRIORITY 1: Atomic has_all set (explicit state)
            setS(prev => ({ ...prev, hasAllEquipment: newState }));
            
            startTransition(async () => {
              const result = await actions.setHasAllEquipment(newState);
              if (!result.ok) {
                // Revert on error
                setS(prev => ({ ...prev, hasAllEquipment: !newState }));
                setError(result.error);
              } else if (!newState) {
                // Show confirmation when turning off
                setEquipmentOffConfirmation(
                  getEquipmentOffMessage(s.equipmentIds.length > 0)
                );
              }
            });
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
                          // PRIORITY 1: Atomic equipment set (explicit state) to prevent data loss
                          const newState = !on;
                          
                          // Optimistic update
                          setS(prev => ({ 
                            ...prev, 
                            equipmentIds: newState 
                              ? [...prev.equipmentIds, e.id]
                              : prev.equipmentIds.filter(id => id !== e.id)
                          }));
                          
                          // Atomic server save (set explicit state)
                          startTransition(async () => {
                            const result = await actions.setEquipmentItem({ equipmentId: e.id, enabled: newState });
                            if (!result.ok) {
                              // Revert on error
                              setS(prev => ({ 
                                ...prev, 
                                equipmentIds: newState 
                                  ? prev.equipmentIds.filter(id => id !== e.id)
                                  : [...prev.equipmentIds, e.id]
                              }));
                              setError(result.error);
                            }
                          });
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
                  // PRIORITY 1: Atomic injury set (explicit state) to prevent data loss
                  const newState = !found;
                  
                  // Optimistic update
                  const next = newState
                    ? [...s.injuries, { bodyRegion: r.value, severity: "current" as const }]
                    : s.injuries.filter((i) => i.bodyRegion !== r.value);
                  setS(prev => ({ ...prev, injuries: next }));
                  
                  // Atomic server save (set explicit state)
                  startTransition(async () => {
                    const result = await actions.setInjury({ 
                      bodyRegion: r.value, 
                      present: newState,
                      severity: newState ? "current" : undefined
                    });
                    if (!result.ok) {
                      // Revert on error
                      setS(prev => ({ ...prev, injuries: found ? [found, ...prev.injuries] : prev.injuries.filter(i => i.bodyRegion !== r.value) }));
                      setError(result.error);
                    }
                  });
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
                        // PRIORITY 1: Atomic injury severity change (explicit state)
                        // Optimistic update
                        const next = s.injuries.map((i) =>
                          i.bodyRegion === inj.bodyRegion ? { ...i, severity: sev } : i,
                        );
                        setS(prev => ({ ...prev, injuries: next }));
                        
                        // Atomic server save (set explicit state with new severity)
                        startTransition(async () => {
                          const result = await actions.setInjury({ bodyRegion: inj.bodyRegion, present: true, severity: sev });
                          if (!result.ok) {
                            // Revert on error
                            setS(prev => ({ ...prev, injuries: s.injuries }));
                            setError(result.error);
                          }
                        });
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
              // M2 L2: Session length affects plan generation
              saveProfile("preferred_session_minutes", { preferred_session_minutes: n }, true);
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
                    
                    // Handle superseded results
                    if (result && typeof result === "object" && "superseded" in result) {
                      return;
                    }
                    
                    setAnySaveOccurred(true);
                    
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
              saveProfile("timezone", { timezone: v });
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
