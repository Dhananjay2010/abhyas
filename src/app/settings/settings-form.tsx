"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import {
  updateEquipment,
  updateInjuries,
  updateProfileSettings,
  updateSessionSettings,
  type Result,
} from "./actions";
import { decideClientEquipmentUpdate } from "./equipment-logic";

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
  actions = REAL_ACTIONS,
}: {
  initial: SettingsState;
  equipment: EquipmentRow[];
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
  /** Set when a change alters what the generator would produce. */
  const [planStale, setPlanStale] = useState(false);

  function save(run: () => Promise<Result>, affectsPlan = false) {
    startTransition(async () => {
      const r = await run();
      if (!r.ok) return setError(r.error);
      setError(null);
      if (affectsPlan) setPlanStale(true);
      // No router.refresh() here. updateSettings and friends revalidate
      // "/settings", and Next.js returns the re-rendered tree with the action's
      // own response — refreshing on top of that fetched this five-query screen
      // a second time, on every single toggle.
    });
  }

  /** Save equipment with rollback on error */
  function saveEquipment(hasAll: boolean, equipmentIds: string[]) {
    const changed = equipmentChanged(hasAll, equipmentIds);
    startTransition(async () => {
      const r = await actions.updateEquipment({ hasAll, equipmentIds });
      if (!r.ok) {
        // Rollback to last saved state
        setS({ ...s, hasAllEquipment: savedEquipment.hasAll, equipmentIds: savedEquipment.ids });
        setEquipmentHint(null);
        return setError(r.error);
      }
      // Success: update saved state
      setSavedEquipment({ hasAll, ids: equipmentIds });
      setEquipmentHint(null);
      setError(null);
      if (changed) setPlanStale(true);
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

  const maxYoga = Math.max(0, (s.daysPerWeek ?? 3) - 1);

  return (
    <div className="space-y-12">
      {error && <ErrorNote>{error}</ErrorNote>}

      {planStale && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm text-accent">
            Your plan no longer matches these answers. Rebuilding keeps every session
            you have already logged.
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
                  setS({ ...s, goal: o.value });
                  save(() => actions.updateProfileSettings({ goal: o.value }), true);
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
                  setS({ ...s, level: o.value });
                  save(() => actions.updateProfileSettings({ level: o.value }), true);
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
                  setS({ ...s, primaryTrack: o.value });
                  save(() => actions.updateProfileSettings({ primary_track: o.value }), true);
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

        <Field label="Yoga days" hint="Counted inside your days per week">
          <Segmented
            options={Array.from({ length: maxYoga + 1 }, (_, n) => ({
              value: n,
              label: `${n}`,
            }))}
            value={s.yogaDaysPerWeek}
            onChange={(n) => {
              setS({ ...s, yogaDaysPerWeek: n });
              save(() => actions.updateProfileSettings({ yoga_days_per_week: n }), true);
            }}
          />
        </Field>
      </Section>

      {/* ---------------- equipment ---------------- */}
      <Section title="Equipment" note="We never suggest an exercise you cannot do.">
        <button
          onClick={() => {
            const decision = decideClientEquipmentUpdate({
              currentHasAll: s.hasAllEquipment,
              currentEquipmentIds: s.equipmentIds,
              action: "toggle",
            });
            
            if (!decision.allow) {
              // Don't save, just show picker with hint
              setS({ ...s, hasAllEquipment: false });
              setEquipmentHint(decision.hint);
              return;
            }
            
            // Allow the toggle and save
            setS({ ...s, hasAllEquipment: decision.newHasAll, equipmentIds: decision.newEquipmentIds });
            saveEquipment(decision.newHasAll, decision.newEquipmentIds);
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

        <Field label="Session length">
          <Segmented
            options={[30, 45, 60, 75].map((n) => ({ value: n, label: `${n}m` }))}
            value={s.preferredSessionMinutes}
            onChange={(n) => {
              setS({ ...s, preferredSessionMinutes: n });
              save(() => actions.updateProfileSettings({ preferred_session_minutes: n }));
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
