#!/usr/bin/env tsx
/**
 * DOM test: Settings' "Your plan no longer matches" banner clears as soon as
 * "Yes, rebuild" succeeds, without a reload (QA1 LOW-3 on #168).
 *
 * Renders the REAL SettingsForm (which renders the REAL BuildPlanButton). Only
 * the buildPlan server action that BuildPlanButton imports is stubbed, so the
 * test controls success or failure.
 *
 * Mutant H in scripts/test-rebuild-rollover-mutants.sh removes the button's
 * `onBuilt?.()` call; the banner then stays and this test fails by assertion.
 *
 *   npx tsx scripts/test-settings-rebuild-clears-stale.tsx
 */
import "../scripts/helpers/setup-jsdom";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
let buildPlanResult: { ok: true } | { ok: false; error: string } = { ok: true };
let buildPlanCalls = 0;
const origRequire = Module.prototype.require;
Module.prototype.require = function (this: { filename?: string }, id: string): unknown {
  if (id === "./actions" && this.filename?.endsWith("build-plan-button.tsx")) {
    return { buildPlan: async () => { buildPlanCalls++; return buildPlanResult; } };
  }
  // eslint-disable-next-line prefer-rest-params
  return origRequire.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ PASS" : "❌ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BANNER = "Your plan no longer matches these answers.";

(async () => {
  const { render, cleanup, act } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { SettingsForm } = await import("../src/app/settings/settings-form");
  type Props = Parameters<typeof SettingsForm>[0];

  const initial: Props["initial"] = {
    goal: "strength", level: "intermediate", primaryTrack: "weights", daysPerWeek: 3, yogaDaysPerWeek: 0,
    preferredSessionMinutes: 60, hasAllEquipment: true, equipmentIds: [], injuries: [], planningMode: "progression",
    perSetLogging: true, resumeSession: true, cooldownEnabled: true, restAutostart: false, restSound: true,
    restVibrate: false, restOverrideSeconds: null, bodyweightPrompt: "weekly", timezone: "America/New_York",
    dateOfBirth: "1990-01-01", units: "metric",
  };
  const actions: Props["actions"] = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => ({ ok: true }),
  };

  const button = (text: string) =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
  const settle = () => new Promise((r) => setTimeout(r, 200));

  async function makeStale() {
    const { container } = render(
      <SettingsForm initial={initial} equipment={[{ id: "barbell", name: "Barbell", category: "free_weight" }]} timezones={["America/New_York"]} actions={actions} />,
    );
    const user = userEvent.setup({ delay: null });
    const fortyFive = Array.from(document.querySelectorAll("button[aria-pressed]")).find((b) => b.textContent === "45m");
    if (!fortyFive) throw new Error("45m session-length button not found");
    await act(async () => { await user.click(fortyFive); });
    await act(settle);
    return { container, user };
  }

  async function rebuild(user: ReturnType<typeof userEvent.setup>) {
    const open = button("Rebuild my block");
    check("banner offers 'Rebuild my block'", !!open);
    if (!open) return;
    await act(async () => { await user.click(open); });
    const yes = button("Yes, rebuild");
    check("confirmation shows 'Yes, rebuild'", !!yes);
    if (!yes) return;
    await act(async () => { await user.click(yes); });
    await act(settle);
  }

  console.log("S1: successful rebuild clears the plan-stale banner without a reload");
  {
    buildPlanResult = { ok: true }; buildPlanCalls = 0;
    const { container, user } = await makeStale();
    check("banner shown after a plan-affecting change", !!container.textContent?.includes(BANNER));
    await rebuild(user);
    check("buildPlan called exactly once", buildPlanCalls === 1, `got ${buildPlanCalls}`);
    check("banner gone right after the rebuild succeeds", !container.textContent?.includes(BANNER));
    check("no 'Rebuild my block' button left", !button("Rebuild my block"));
    cleanup();
  }

  console.log("\nS2: failed rebuild keeps the banner and shows the error");
  {
    buildPlanResult = { ok: false, error: "We couldn't rebuild your plan just now." }; buildPlanCalls = 0;
    const { container, user } = await makeStale();
    await rebuild(user);
    check("buildPlan called exactly once", buildPlanCalls === 1, `got ${buildPlanCalls}`);
    check("banner still shown after a failed rebuild", !!container.textContent?.includes(BANNER));
    const alert = container.querySelector('[role="alert"]');
    check("error shown to the member", !!alert?.textContent?.includes("couldn't rebuild"), alert?.textContent ?? "no alert");
    cleanup();
  }

  console.log(failures ? `\n❌ ${failures} FAIL` : "\n✅ All Settings rebuild banner checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
