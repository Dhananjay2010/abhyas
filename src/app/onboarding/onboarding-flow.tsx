"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BODY_REGIONS,
  GOALS,
  HOME_TRACKS,
  LEVELS,
  MIN_AGE_YEARS,
  SEXES,
  splitLabelFor,
  type BodyRegion,
  type Goal,
  type InjurySeverity,
  type Level,
  type Sex,
  type Track,
} from "@/lib/onboarding/options";
import {
  SESSION_LENGTH_OPTIONS,
  DEFAULT_SESSION_LENGTH,
  initialStepIndex,
} from "@/lib/onboarding/session-length";
import { validateDob, getDobErrorMessage } from "@/lib/onboarding/dob";
import { DobInput } from "@/components/onboarding/dob-input";
import {
  ErrorNote,
  Field,
  GhostButton,
  OptionCard,
  PrimaryButton,
  StepShell,
  inputClass,
} from "@/components/ui";
import {
  acceptDisclaimer,
  completeOnboarding,
  saveAboutYou,
  saveEquipment,
  saveInjuries,
  saveProfileFields,
  saveSessionLength,
  type ActionResult,
} from "./actions";
import { branding } from "@/lib/branding";
import {
  formatBodyWeight,
  formatHeight,
  parseBodyWeight,
  parseHeight,
  weightLabel,
  heightLabel,
  getBodyWeightRangeMessage,
  type UnitsPreference,
} from "@/lib/units";

type StepId =
  | "disclaimer"
  | "about"
  | "goal"
  | "level"
  | "track"
  | "days"
  | "session-length"
  | "mix"
  | "equipment"
  | "injuries";

export type EquipmentRow = { id: string; name: string; category: string };

export type InitialState = {
  displayName: string | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: Goal | null;
  level: Level | null;
  primaryTrack: Track | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  yogaDaysPerWeek: number;
  disclaimerAccepted: boolean;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  injuries: { bodyRegion: BodyRegion; severity: InjurySeverity }[];
  units: UnitsPreference;
};

const CATEGORY_LABELS: Record<string, string> = {
  bodyweight: "No equipment",
  free_weight: "Free weights",
  machine: "Machines",
  cable: "Cables",
  accessory: "Accessories",
};

export type OnboardingActions = {
  acceptDisclaimer: typeof acceptDisclaimer;
  saveAboutYou: typeof saveAboutYou;
  saveProfileFields: typeof saveProfileFields;
  saveEquipment: typeof saveEquipment;
  saveInjuries: typeof saveInjuries;
  saveSessionLength: typeof saveSessionLength;
  completeOnboarding: typeof completeOnboarding;
};

const REAL_ACTIONS: OnboardingActions = {
  acceptDisclaimer,
  saveAboutYou,
  saveProfileFields,
  saveEquipment,
  saveInjuries,
  saveSessionLength,
  completeOnboarding,
};

export function OnboardingFlow({
  initial,
  equipment,
  actions = REAL_ACTIONS,
  onFinish,
}: {
  initial: InitialState;
  equipment: EquipmentRow[];
  actions?: OnboardingActions;
  onFinish?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Date of birth as ISO string (YYYY-MM-DD)
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(initial.dateOfBirth);
  const [dobTouched, setDobTouched] = useState(false);
  
  const [sex, setSex] = useState<Sex | null>(initial.sex);
  const [units, setUnits] = useState<UnitsPreference>(initial.units);
  const [heightCm, setHeightCm] = useState(
    initial.heightCm ? formatHeight(initial.heightCm, units, false) : ""
  );
  const [heightTouched, setHeightTouched] = useState(false);
  const [weightKg, setWeightKg] = useState(
    initial.weightKg ? formatBodyWeight(initial.weightKg, units, false) : ""
  );
  const [weightTouched, setWeightTouched] = useState(false);
  const [goal, setGoal] = useState<Goal | null>(initial.goal);
  const [level, setLevel] = useState<Level | null>(initial.level);
  const [location, setLocation] = useState<"gym" | "home" | null>(
    initial.primaryTrack === "weights" ? "gym" : initial.primaryTrack ? "home" : null,
  );
  const [homeTrack, setHomeTrack] = useState<Track | null>(
    initial.primaryTrack && initial.primaryTrack !== "weights" ? initial.primaryTrack : null,
  );
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(initial.daysPerWeek);
  const [sessionLength, setSessionLength] = useState<number>(
    initial.sessionMinutes ?? DEFAULT_SESSION_LENGTH
  );
  const [yogaDays, setYogaDays] = useState<number | null>(
    initial.yogaDaysPerWeek > 0 ? initial.yogaDaysPerWeek : null
  );
  const [yogaTouched, setYogaTouched] = useState(false);
  const [hasAllEquipment, setHasAllEquipment] = useState(initial.hasAllEquipment);
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(
    new Set(initial.equipmentIds),
  );
  const [injuries, setInjuries] = useState<Map<BodyRegion, InjurySeverity>>(
    new Map(initial.injuries.map((i) => [i.bodyRegion, i.severity])),
  );

  const track: Track | null = location === "gym" ? "weights" : homeTrack;
  // Assume a physical track until told otherwise, so the progress denominator
  // shrinks for the yoga/breathing minority rather than growing for everyone else.
  const trainsPhysically = track === null || track === "weights" || track === "bodyweight";

  // Equipment and the yoga mix are meaningless for a yoga- or breathing-led plan.
  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = ["disclaimer", "about", "goal", "level", "track", "days", "session-length"];
    if (trainsPhysically) base.push("mix", "equipment");
    base.push("injuries");
    return base;
  }, [trainsPhysically]);

  const [stepIndex, setStepIndex] = useState(() =>
    Math.max(0, initialStepIndex(initial)),
  );
  const current = steps[Math.min(stepIndex, steps.length - 1)];

  function back() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  /** Persist the step, and only advance if the write actually succeeded. */
  function advance(run: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStepIndex((i) => i + 1);
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const saved = await actions.saveInjuries(
        [...injuries.entries()].map(([bodyRegion, severity]) => ({ bodyRegion, severity })),
      );
      if (!saved.ok) return setError(saved.error);

      const done = await actions.completeOnboarding();
      if (!done.ok) return setError(done.error);

      if (onFinish) return onFinish();
      router.push("/today");
      router.refresh();
    });
  }

  const shell = {
    step: steps.indexOf(current),
    totalSteps: steps.length,
    onBack: stepIndex > 0 ? back : undefined,
  };

  if (current === "disclaimer") {
    return (
      <StepShell
        {...shell}
        title="Before we start"
        subtitle="Please read this properly. It matters."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={pending}
              onClick={() => advance(actions.acceptDisclaimer)}
            >
              {pending ? "Saving…" : "I understand, continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <p>
            {branding.name} gives general fitness guidance. It is{" "}
            <strong className="text-fg">not medical advice</strong>, and it is not a
            substitute for a doctor or a qualified trainer.
          </p>
          <p>
            Talk to a doctor before you start if you have a heart condition, high blood
            pressure, an injury, are pregnant, or have been inactive for a long time.
          </p>
          <p>
            Stop immediately if you feel chest pain, dizziness or sharp joint pain. Sore is
            fine. Sharp is not.
          </p>
          <p>
            You must be at least {MIN_AGE_YEARS} years old to use {branding.name}. You train at your
            own risk.
          </p>
          <p className="pt-2 border-t border-border">
            By continuing, you agree to our{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </StepShell>
    );
  }

  if (current === "about") {
    // Parse height and weight from user input
    const heightCmValue = parseHeight(heightCm, units);
    const weightKgValue = parseBodyWeight(weightKg, units);
    
    // Get today as ISO string for validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Validate DOB
    const dobValidationError = dobTouched && dateOfBirth ? validateDob(dateOfBirth, todayIso) : null;
    const dobError = dobValidationError ? getDobErrorMessage(dobValidationError) : null;
    
    const heightError = heightTouched && heightCm !== "" && heightCmValue === null
      ? units === "imperial"
        ? "Height should be between 3'3\" and 8'2\""
        : "Height should be between 100 and 250 cm"
      : null;
    const weightError = weightTouched && weightKg !== "" && weightKgValue === null
      ? getBodyWeightRangeMessage(units)
      : null;
    
    const dobValid = dateOfBirth !== null && dobValidationError === null;
    
    const ready =
      dobValid && sex !== null && heightCmValue !== null && weightKgValue !== null && 
      !heightError && !weightError && !pending;

    return (
      <StepShell
        {...shell}
        title={initial.displayName ? `About you, ${initial.displayName.split(" ")[0]}` : "About you"}
        subtitle="Age and body size are used as safety filters — they decide what we keep out of your plan, not what we put in."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!ready}
              onClick={() => {
                // Mark all fields as touched when attempting to continue
                setDobTouched(true);
                setHeightTouched(true);
                setWeightTouched(true);
                
                // Only proceed if ready
                if (!ready) return;
                
                if (heightCmValue === null || weightKgValue === null) return;
                
                // Detect browser timezone on client
                const browserTimezone =
                  typeof window !== "undefined"
                    ? Intl.DateTimeFormat().resolvedOptions().timeZone
                    : undefined;
                
                advance(() =>
                  actions.saveAboutYou({
                    dateOfBirth: dateOfBirth!,
                    sex: sex!,
                    heightCm: heightCmValue,
                    weightKg: weightKgValue,
                    units,
                    browserTimezone,
                  }),
                );
              }}
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <span className="text-sm font-medium text-fg">Units</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <OptionCard
                compact
                label="Metric (kg, cm)"
                selected={units === "metric"}
                onClick={() => {
                  setUnits("metric");
                  setHeightCm("");
                  setWeightKg("");
                  setHeightTouched(false);
                  setWeightTouched(false);
                }}
              />
              <OptionCard
                compact
                label="Imperial (lb, ft/in)"
                selected={units === "imperial"}
                onClick={() => {
                  setUnits("imperial");
                  setHeightCm("");
                  setWeightKg("");
                  setHeightTouched(false);
                  setWeightTouched(false);
                }}
              />
            </div>
          </div>
          <DobInput
            value={dateOfBirth}
            onChange={setDateOfBirth}
            error={dobError ?? undefined}
            onBlur={() => setDobTouched(true)}
          />

          <div>
            <span className="text-sm font-medium text-fg">Sex</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SEXES.map((o) => (
                <OptionCard
                  key={o.value}
                  compact
                  label={o.label}
                  selected={sex === o.value}
                  onClick={() => setSex(o.value)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Height" hint={heightLabel(units)} error={heightError}>
              <input
                type="text"
                inputMode={units === "imperial" ? "text" : "decimal"}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                onBlur={() => setHeightTouched(true)}
                placeholder={units === "imperial" ? "e.g. 5'9\"" : "e.g. 175"}
                className={inputClass}
              />
            </Field>
            <Field label="Weight" hint={weightLabel(units)} error={weightError}>
              <input
                type="number"
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                onBlur={() => setWeightTouched(true)}
                placeholder={units === "imperial" ? "e.g. 154" : "e.g. 70"}
                step="any"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </StepShell>
    );
  }

  if (current === "goal") {
    return (
      <StepShell
        {...shell}
        title="What are you training for?"
        subtitle="This sets your rep ranges and rest times. It is the single biggest input."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!goal || pending}
              onClick={() => advance(() => actions.saveProfileFields({ goal }))}
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          {GOALS.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              description={o.description}
              selected={goal === o.value}
              onClick={() => setGoal(o.value)}
            />
          ))}
        </div>
      </StepShell>
    );
  }

  if (current === "level") {
    return (
      <StepShell
        {...shell}
        title="Where are you right now?"
        subtitle="Be honest rather than optimistic. You can change this later."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!level || pending}
              onClick={() => advance(() => actions.saveProfileFields({ level }))}
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          {LEVELS.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              description={o.description}
              selected={level === o.value}
              onClick={() => setLevel(o.value)}
            />
          ))}
        </div>
      </StepShell>
    );
  }

  if (current === "track") {
    return (
      <StepShell
        {...shell}
        title="Where will you train?"
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!track || pending}
              onClick={() => advance(() => actions.saveProfileFields({ primary_track: track }))}
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          <OptionCard
            label="At a gym"
            description="Barbells, dumbbells, machines and cables. Full progression on load."
            selected={location === "gym"}
            onClick={() => {
              setLocation("gym");
              setHomeTrack(null);
            }}
          />
          <OptionCard
            label="At home"
            description="No gym needed."
            selected={location === "home"}
            onClick={() => setLocation("home")}
          />

          {location === "home" && (
            <div className="ml-3 space-y-3 border-l border-border pl-4 pt-1">
              {HOME_TRACKS.map((o) => (
                <OptionCard
                  key={o.value}
                  compact
                  label={o.label}
                  description={o.description}
                  selected={homeTrack === o.value}
                  onClick={() => setHomeTrack(o.value)}
                />
              ))}
            </div>
          )}
        </div>
      </StepShell>
    );
  }

  if (current === "days") {
    return (
      <StepShell
        {...shell}
        title="How many days a week?"
        subtitle="Pick what you will actually do, not what you wish you would do. This chooses your split."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!daysPerWeek || pending}
              onClick={() =>
                advance(() =>
                  actions.saveProfileFields({
                    days_per_week: daysPerWeek,
                    // Keep the mix inside the chosen number of days.
                    yoga_days_per_week: Math.min(yogaDays ?? 0, (daysPerWeek ?? 3) - 1),
                  }),
                )
              }
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          {[3, 4, 5, 6].map((d) => (
            <OptionCard
              key={d}
              label={`${d} days`}
              description={trainsPhysically ? splitLabelFor(d, yogaDays ?? 0) : undefined}
              selected={daysPerWeek === d}
              onClick={() => {
                setDaysPerWeek(d);
                if (yogaDays !== null && yogaDays > d - 1) setYogaDays(d - 1);
              }}
            />
          ))}
        </div>
      </StepShell>
    );
  }

  if (current === "session-length") {
    return (
      <StepShell
        {...shell}
        title="How long are your sessions?"
        subtitle="Shorter sessions mean fewer exercises per day. You can change this later."
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={pending}
              onClick={() =>
                advance(() => actions.saveSessionLength(sessionLength))
              }
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div
          role="radiogroup"
          aria-label="Session length"
          className="flex flex-wrap gap-3"
        >
          {SESSION_LENGTH_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={sessionLength === minutes}
              onClick={() => setSessionLength(minutes)}
              className={`min-h-[44px] min-w-[44px] rounded-xl border px-6 py-3 text-base font-semibold transition-colors ${
                sessionLength === minutes
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-fg hover:border-muted/50"
              }`}
            >
              {minutes}m
            </button>
          ))}
        </div>
      </StepShell>
    );
  }

  if (current === "mix") {
    const max = (daysPerWeek ?? 3) - 1;
    const yogaValid = yogaDays !== null;
    return (
      <StepShell
        {...shell}
        title="Any yoga in the week?"
        subtitle={`Yoga counts as a training day. Of your ${daysPerWeek} days, some can be yoga instead of training.`}
        footer={
          <>
            {yogaTouched && !yogaValid && (
              <p className="mb-3 text-sm text-danger" aria-live="polite">
                Please select how many yoga days you want (or choose &ldquo;No yoga&rdquo;)
              </p>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={!yogaValid || pending}
              onClick={() => {
                setYogaTouched(true);
                if (!yogaValid) return;
                advance(() => actions.saveProfileFields({ yoga_days_per_week: yogaDays ?? 0 }));
              }}
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          {Array.from({ length: max + 1 }, (_, n) => n).map((n) => (
            <OptionCard
              key={n}
              compact
              label={n === 0 ? "No yoga" : `${n} yoga ${n === 1 ? "day" : "days"}`}
              description={
                (n === 0
                  ? `All ${daysPerWeek} days are training`
                  : `${(daysPerWeek ?? 0) - n} training + ${n} yoga`) +
                ` · ${splitLabelFor(daysPerWeek ?? 3, n)}`
              }
              selected={yogaDays === n}
              onClick={() => setYogaDays(n)}
            />
          ))}
        </div>
      </StepShell>
    );
  }

  if (current === "equipment") {
    const isBodyweightOnly = track === "bodyweight";
    const grouped = equipment.reduce<Record<string, EquipmentRow[]>>((acc, e) => {
      (acc[e.category] ??= []).push(e);
      return acc;
    }, {});
    
    // Preselect bodyweight equipment for bodyweight track
    if (isBodyweightOnly && grouped.bodyweight && selectedEquipment.size === 0) {
      const bodyweightIds = grouped.bodyweight.map((e) => e.id);
      setSelectedEquipment(new Set(bodyweightIds));
      setHasAllEquipment(false);
    }
    
    // Order bodyweight first for home users
    const categories = Object.keys(grouped);
    const orderedCategories = location === "home" && categories.includes("bodyweight")
      ? ["bodyweight", ...categories.filter((k) => k !== "bodyweight")]
      : categories;

    const toggle = (id: string) => {
      setHasAllEquipment(false);
      setSelectedEquipment((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <StepShell
        {...shell}
        title={isBodyweightOnly ? "Bodyweight training confirmed" : "What can you actually use?"}
        subtitle={
          isBodyweightOnly
            ? "We've selected bodyweight equipment for you. Add anything else you have."
            : "We never suggest an exercise you have no equipment for."
        }
        footer={
          <>
            {error && <ErrorNote>{error}</ErrorNote>}
            <PrimaryButton
              disabled={pending || (!hasAllEquipment && selectedEquipment.size === 0)}
              onClick={() =>
                advance(() =>
                  actions.saveEquipment({
                    hasAll: hasAllEquipment,
                    equipmentIds: [...selectedEquipment],
                  }),
                )
              }
            >
              {pending ? "Saving…" : "Continue"}
            </PrimaryButton>
          </>
        }
      >
        <button
          type="button"
          onClick={() => {
            setHasAllEquipment(true);
            setSelectedEquipment(new Set());
          }}
          aria-pressed={hasAllEquipment}
          className={`mb-6 w-full rounded-xl border px-5 py-4 text-left transition-colors ${
            hasAllEquipment
              ? "border-accent bg-accent/10"
              : "border-border bg-surface hover:border-muted/50"
          }`}
        >
          <span className={`font-semibold ${hasAllEquipment ? "text-accent" : "text-fg"}`}>
            I have access to everything
          </span>
          <p className="mt-1 text-sm text-muted">
            A fully equipped gym. Skip the list.
          </p>
        </button>

        {equipment.length === 0 && (
          <ErrorNote>
            The equipment catalogue did not load. Choose &ldquo;I have access to
            everything&rdquo; to continue, then correct it in Settings.
          </ErrorNote>
        )}

        <div className={hasAllEquipment ? "pointer-events-none opacity-40" : ""}>
          {orderedCategories.map((category) => {
            const items = grouped[category];
            if (!items) return null;
            return (
              <div key={category} className="mb-6">
                <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {items.map((e) => {
                    const on = selectedEquipment.has(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => toggle(e.id)}
                        aria-pressed={on}
                        className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                          on
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-surface text-muted hover:text-fg"
                        }`}
                      >
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </StepShell>
    );
  }

  // injuries
  function toggleRegion(region: BodyRegion) {
    setInjuries((prev) => {
      const next = new Map(prev);
      if (next.has(region)) next.delete(region);
      else next.set(region, "current");
      return next;
    });
  }

  return (
    <StepShell
      {...shell}
      title="Anything hurt?"
      subtitle="We exclude exercises that load an injured area, and add specific prehab work to your warm-up instead."
      footer={
        <>
          {error && <ErrorNote>{error}</ErrorNote>}
          <PrimaryButton disabled={pending} onClick={finish}>
            {pending
              ? "Setting up…"
              : injuries.size === 0
                ? "Nothing hurts, finish"
                : "Finish"}
          </PrimaryButton>
          {injuries.size > 0 && (
            <GhostButton onClick={() => setInjuries(new Map())}>Clear all</GhostButton>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {BODY_REGIONS.map((r) => {
          const on = injuries.has(r.value);
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleRegion(r.value)}
              aria-pressed={on}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                on
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted hover:text-fg"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {injuries.size > 0 && (
        <div className="mt-7 space-y-3">
          {[...injuries.entries()].map(([region, severity]) => (
            <div
              key={region}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <span className="text-sm font-medium">
                {BODY_REGIONS.find((r) => r.value === region)?.label}
              </span>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
                {(["current", "past"] as InjurySeverity[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setInjuries((prev) => new Map(prev).set(region, s))
                    }
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      severity === s ? "bg-accent text-accent-fg" : "text-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </StepShell>
  );
}
